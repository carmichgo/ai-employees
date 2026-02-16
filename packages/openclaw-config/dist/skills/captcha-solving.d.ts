/**
 * Captcha Solving Skill — generates SKILL.md content for the Blitzer container.
 *
 * Supports two providers:
 *   1. 2captcha — CLI binary (solve-captcha) that calls 2captcha.com human-powered API
 *   2. capsolver — Chrome extension that auto-solves CAPTCHAs in the browser
 *
 * The skill teaches the AI employee how to handle CAPTCHAs when browsing the web,
 * creating accounts, or automating tasks.
 */
export declare function generateCaptchaSolvingSkill(): string;
/** Returns the install script for captcha tools in the container */
export declare function generateCaptchaInstallScript(containerName: string): string;
//# sourceMappingURL=captcha-solving.d.ts.map