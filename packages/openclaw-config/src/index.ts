export {
  generateOpenClawConfig,
  generateIdentityMd,
  generateSoulMd,
  generateUserMd,
  generateToolsMd,
  generateAgentsMd,
  generateHeartbeatMd,
  generateEmployeeEmail,
  regenerateChannelConfig,
} from "./generator.js";
export type { EmployeeInput, ChannelInput, OpenClawConfig } from "./generator.js";
export { generateCredentialManagerScript, generateCredentialManagerInstallScript } from "./credential-manager.js";
export { generateCaptchaSolvingSkill, generateCaptchaInstallScript } from "./skills/captcha-solving.js";
export { generateAccountCreationSkill } from "./skills/account-creation.js";
export { generateTaskLoggingSkill } from "./skills/task-logging.js";
export { generateRestartGatewaySkill } from "./skills/restart-gateway.js";
export { generateTeamCommunicationSkill } from "./skills/team-communication.js";
export { generateTaskManagementSkill } from "./skills/task-management.js";
export { generateMediaGenerationSkill, generateImageScript, generateVideoScript } from "./skills/media-generation.js";
export { generateDocxSkill, generateDocxInstallScript } from "./skills/docx.js";
