/**
 * Twilio Voice Gather Callback — processes speech from the caller
 * and sends it to the employee's AI, then speaks the response.
 *
 * Flow:
 *   1. Caller speaks → Twilio transcribes → POSTs here with SpeechResult
 *   2. We forward the text to the employee's Blitzer container via chat API
 *   3. We respond with TwiML <Say> containing the AI's reply
 *   4. We <Gather> again for the next turn of conversation
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";

function twiml(body: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

export async function POST(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  if (!employeeId) {
    return twiml(`<Say voice="Polly.Amy">An error occurred. Goodbye.</Say><Hangup/>`);
  }

  const formData = await request.formData();
  const speechResult = (formData.get("SpeechResult") as string) || "";

  if (!speechResult.trim()) {
    return twiml(
      `<Say voice="Polly.Amy">I didn't catch that. Could you repeat?</Say>` +
      `<Gather input="speech" action="${escapeXml(request.nextUrl.pathname)}?employeeId=${employeeId}" method="POST" speechTimeout="auto" language="en-US">` +
      `<Say voice="Polly.Amy">Go ahead.</Say>` +
      `</Gather>` +
      `<Say voice="Polly.Amy">Goodbye!</Say>`,
    );
  }

  // Look up the employee
  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      status: employees.status,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee || employee.status !== "active" || !employee.dropletIp) {
    return twiml(
      `<Say voice="Polly.Amy">I'm sorry, I'm currently unavailable. Please try again later. Goodbye.</Say><Hangup/>`,
    );
  }

  // Forward the transcribed speech to the employee's chat endpoint
  let reply = "I'm sorry, I couldn't process that right now.";
  try {
    const chatRes = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${employee.id}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": employee.interserviceSecret || "",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: `[Phone call] ${speechResult}` }],
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (chatRes.ok) {
      const data = await chatRes.json();
      if (data.reply) {
        // Strip markdown for speech
        reply = data.reply
          .replace(/```[\s\S]*?```/g, " code block ")
          .replace(/`[^`]+`/g, (m: string) => m.slice(1, -1))
          .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
          .replace(/\[[^\]]*\]\([^)]+\)/g, (m: string) =>
            m.replace(/\[([^\]]*)\]\([^)]+\)/, "$1"),
          )
          .replace(/[#*_~>]/g, "")
          .replace(/\n{2,}/g, ". ")
          .replace(/\n/g, " ")
          .trim();
      }
    }
  } catch {
    // Use the default fallback reply
  }

  // Respond with the AI's reply and gather next input
  const respondUrl = `${request.nextUrl.origin}/api/twilio/voice/respond?employeeId=${employeeId}`;

  return twiml(
    `<Say voice="Polly.Amy">${escapeXml(reply)}</Say>` +
    `<Gather input="speech" action="${escapeXml(respondUrl)}" method="POST" speechTimeout="auto" language="en-US">` +
    `<Say voice="Polly.Amy">Is there anything else?</Say>` +
    `</Gather>` +
    `<Say voice="Polly.Amy">Thank you for calling. Goodbye!</Say>`,
  );
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
