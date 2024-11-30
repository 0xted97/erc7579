export enum ModuleType { 
    MultiSig = 'multi-sig',
    Governance = 'governance',
}
export interface Module {
    id: ModuleType;
    name: string;
    description: string;
    address: string;
}

export const MODULES: Module[] = [
    // {
    //     id: ModuleType.MultiSig,
    //     name: 'Multi Sig',
    //     description: 'This is a multi-signature wallet module',
    //     address: '123 Main St'
    // },
    {
        id: ModuleType.Governance,
        name: 'Module2',
        description: 'This is the second module',
        address: '456 Elm St'
    }
];