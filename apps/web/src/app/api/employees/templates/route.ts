import { NextResponse } from "next/server";
import { JOB_TEMPLATES, getJobTemplateCategories } from "@ai-employees/shared";

export async function GET() {
  return NextResponse.json({
    templates: JOB_TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      emoji: t.emoji,
      category: t.category,
      description: t.description,
      suggestedChannels: t.suggestedChannels,
    })),
    categories: getJobTemplateCategories(),
  });
}
