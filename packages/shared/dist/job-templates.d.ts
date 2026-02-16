export interface JobTemplate {
    id: string;
    title: string;
    emoji: string;
    category: string;
    description: string;
    persona: string;
    goals: string;
    suggestedSkills: string[];
    suggestedChannels: string[];
    modelRecommendation: string;
    defaultPersonality: PersonalityConfig;
}
export interface PersonalityConfig {
    autonomy: "full" | "high" | "moderate" | "low";
    proactivity: "very-proactive" | "proactive" | "balanced" | "reactive";
    communication: "concise" | "detailed" | "casual" | "formal";
    bossTechnicalLevel?: "very-technical" | "technical" | "somewhat-technical" | "non-technical";
}
export declare const DEFAULT_PERSONALITY: PersonalityConfig;
export declare const AUTONOMY_OPTIONS: readonly [{
    readonly value: "full";
    readonly label: "Full autonomy";
    readonly desc: "Acts independently, only reports results";
}, {
    readonly value: "high";
    readonly label: "High autonomy";
    readonly desc: "Acts on most things, checks in on big decisions";
}, {
    readonly value: "moderate";
    readonly label: "Moderate";
    readonly desc: "Asks before major actions, handles routine tasks alone";
}, {
    readonly value: "low";
    readonly label: "Always ask";
    readonly desc: "Checks with you before doing anything significant";
}];
export declare const PROACTIVITY_OPTIONS: readonly [{
    readonly value: "very-proactive";
    readonly label: "Very proactive";
    readonly desc: "Finds work, suggests ideas, anticipates needs";
}, {
    readonly value: "proactive";
    readonly label: "Proactive";
    readonly desc: "Takes initiative on obvious next steps";
}, {
    readonly value: "balanced";
    readonly label: "Balanced";
    readonly desc: "Handles assigned work, occasionally suggests improvements";
}, {
    readonly value: "reactive";
    readonly label: "Reactive";
    readonly desc: "Waits for instructions, executes what's asked";
}];
export declare const COMMUNICATION_OPTIONS: readonly [{
    readonly value: "concise";
    readonly label: "Concise";
    readonly desc: "Short, to the point — no fluff";
}, {
    readonly value: "detailed";
    readonly label: "Detailed";
    readonly desc: "Thorough explanations with context";
}, {
    readonly value: "casual";
    readonly label: "Casual";
    readonly desc: "Friendly, informal tone";
}, {
    readonly value: "formal";
    readonly label: "Formal";
    readonly desc: "Professional, structured communication";
}];
export declare const BOSS_TECHNICAL_LEVEL_OPTIONS: readonly [{
    readonly value: "very-technical";
    readonly label: "Very technical";
    readonly desc: "I'm an engineer — give me APIs, code, and CLI tools";
}, {
    readonly value: "technical";
    readonly label: "Technical";
    readonly desc: "I can handle APIs and configs, but prefer simple setups";
}, {
    readonly value: "somewhat-technical";
    readonly label: "Somewhat technical";
    readonly desc: "I know the basics but prefer no-code solutions";
}, {
    readonly value: "non-technical";
    readonly label: "Non-technical";
    readonly desc: "Keep everything simple — no code, no APIs";
}];
export declare const JOB_TEMPLATES: JobTemplate[];
export declare function getJobTemplate(id: string): JobTemplate | undefined;
export declare function getJobTemplatesByCategory(category: string): JobTemplate[];
export declare function getJobTemplateCategories(): string[];
//# sourceMappingURL=job-templates.d.ts.map