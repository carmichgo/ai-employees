/**
 * Twilio Voice Webhook — handles incoming phone calls to AI employees.
 *
 * When someone calls a Twilio phone number assigned to an employee,
 * Twilio POSTs here. We greet the caller with the employee's name
 * and use <Gather input="speech"> to record what they say.
 *
 * Configure this URL as the "Voice & Fax > A CALL COMES IN" webhook
 * in your Twilio phone number settings:
 *   https://your-domain.com/api/twilio/voice
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
  const formData = await request.formData();
  const toNumber = (formData.get("To") as string) || "";

  // Look up which employee owns this phone number
  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      status: employees.status,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(eq(employees.phoneNumber, toNumber))
    .limit(1);

  if (!employee) {
    return twiml(
      `<Say voice="Polly.Amy">Sorry, this number is not assigned to any employee. Goodbye.</Say><Hangup/>`,
    );
  }

  if (employee.status !== "active") {
    return twiml(
      `<Say voice="Polly.Amy">Hi, this is ${escapeXml(employee.name)}'s line. I'm currently unavailable. Please try again later. Goodbye.</Say><Hangup/>`,
    );
  }

  // Build the respond callback URL with the employee ID
  const baseUrl = request.nextUrl.origin;
  const respondUrl = `${baseUrl}/api/twilio/voice/respond?employeeId=${employee.id}`;

  return twiml(
    `<Say voice="Polly.Amy">Hi, you've reached ${escapeXml(employee.name)}, ${escapeXml(employee.jobTitle)}. Go ahead, I'm listening.</Say>` +
    `<Gather input="speech" action="${escapeXml(respondUrl)}" method="POST" speechTimeout="auto" language="en-US">` +
    `<Say voice="Polly.Amy">I'm still here. Go ahead.</Say>` +
    `</Gather>` +
    `<Say voice="Polly.Amy">I didn't hear anything. Goodbye!</Say>`,
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
