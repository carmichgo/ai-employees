export { generateOpenClawConfig, generateSoulMd, generateEmployeeEmail, regenerateChannelConfig } from "./generator.js";
export type { EmployeeInput, ChannelInput, OpenClawConfig } from "./generator.js";
export { generateCredentialManagerScript, generateCredentialManagerInstallScript } from "./credential-manager.js";
export { generateCaptchaSolvingSkill, generateCaptchaInstallScript } from "./skills/captcha-solving.js";
export { generateAccountCreationSkill } from "./skills/account-creation.js";
export { generateRestartGatewaySkill } from "./skills/restart-gateway.js";
