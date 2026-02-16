export interface ProvisionJobData {
    employeeId: string;
    companyId: string;
    channels: string[];
    channelCredentials?: Record<string, Record<string, unknown>>;
    skills?: string[];
}
export declare function provisionEmployee(data: ProvisionJobData): Promise<void>;
export declare function stopEmployee(employeeId: string): Promise<void>;
export declare function startEmployee(employeeId: string): Promise<void>;
export declare function teardownEmployee(employeeId: string): Promise<void>;
/** On startup, find and remove containers for terminated employees */
export declare function cleanupOrphanedContainers(): Promise<void>;
//# sourceMappingURL=provision-employee.d.ts.map