/**
 * Slack Proxy — one Socket Mode connection per company droplet.
 *
 * Instead of each Blitzer container connecting to Slack independently
 * (which causes event round-robin and identical bot identities), this proxy:
 *
 *  1. Maintains a single Socket Mode connection to the company's Slack workspace
 *  2. Routes incoming messages to the correct employee's Blitzer container
 *  3. Posts responses back with per-employee identity (name + emoji) via chat:write.customize
 *  4. Creates dedicated Slack channels for each employee on demand
 *
 * This makes every AI employee appear as a different "user" in Slack.
 *
 * Uses dynamic imports so the API builds and runs even if @slack/bolt
 * isn't installed — the proxy simply won't start.
 */
export declare class SlackProxy {
    private app;
    private webClient;
    private channelToEmployee;
    private companyId;
    private botUserId;
    private running;
    /**
     * Start the Slack proxy if the company on this droplet has Slack connected.
     * Reads credentials from the DB (botToken) and env vars (appToken).
     */
    start(): Promise<void>;
    /** Stop the Slack proxy */
    stop(): Promise<void>;
    /** Restart the Slack proxy (re-reads credentials from DB) */
    restart(): Promise<void>;
    /** Reload employee mappings from the DB */
    refreshMappings(): Promise<void>;
    /**
     * Create a dedicated Slack channel for an employee.
     * Channel name: emp-{slugified-employee-name}
     * Returns the channel ID or null if creation failed.
     */
    createEmployeeChannel(employeeId: string): Promise<string | null>;
    /** Find an existing channel by name and associate it with the employee */
    private findExistingChannel;
    /** Archive a Slack channel when an employee is terminated */
    archiveEmployeeChannel(employeeId: string): Promise<void>;
    /**
     * Fetch recent conversation history from a Slack channel and convert
     * to OpenAI-style messages so the AI employee has context of the conversation.
     */
    private fetchChannelHistory;
    /** Handle incoming Slack messages */
    private handleMessage;
    /** Handle @mentions of the bot in shared channels */
    private handleMention;
    /** Post a message as a specific employee */
    private postAsEmployee;
    /** Check if the proxy is running */
    isRunning(): boolean;
    /** Create Slack channels for all active employees that don't have one yet */
    reconcileChannels(): Promise<Array<{
        name: string;
        channelId: string | null;
    }>>;
    /**
     * Announce a new AI employee in #general so everyone in the workspace gets notified.
     * Uses <!everyone> so all members see the notification.
     */
    private announceNewEmployee;
    /** Post a message as an employee by employee ID (for use from other parts of the API) */
    postMessageAsEmployee(employeeId: string, channelId: string, text: string): Promise<boolean>;
}
/** Get or create the singleton Slack proxy */
export declare function getSlackProxy(): SlackProxy;
//# sourceMappingURL=proxy.d.ts.map