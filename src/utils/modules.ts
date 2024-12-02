export enum ModuleType { 
    MultiSig = 'multi-sig',
    ColStorage = 'cold-storage',
    Webauthn = 'webauthn',
    AutoSaving = 'auto-saving',
    ScheduleTransfer = 'schedule-transfer',
}
export interface Module {
    id: ModuleType;
    name: string;
    description: string;
}

export const MODULES: Module[] = [
    {
        id: ModuleType.Webauthn,
        name: 'WebAuthn',
        description: 'WebAuthn validator for user authentication',
    },
    {
        id: ModuleType.ColStorage,
        name: 'Cold Storage',
        description: 'Timelock and transfer restrictions',
    },
    {
        id: ModuleType.ScheduleTransfer,
        name: 'Schedule Transfer',
        description: 'Schedule transfer of assets',
    }
];
