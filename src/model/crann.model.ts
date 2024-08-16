import browser from 'webextension-polyfill';

export const Partition = {
    Instance: 'instance' as const,
    Common: 'common' as const
};
export const Persistence = {
    Session: 'session' as const,
    Local: 'local' as const,
    None: 'none' as const
};

type ConfigItem<T> = {
    default: T;
    partition?: typeof Partition[keyof typeof Partition]
    persist?: typeof Persistence[keyof typeof Persistence]
}

// export type Config = typeof StateConfig;

type DerivedState<T extends Record<string, ConfigItem<any>>> = {
    [P in keyof T]: T[P]['default'];
};
type DerivedInstanceState<T extends Record<string, ConfigItem<any>>> = {
    [P in keyof T as T[P]['partition'] extends 'instance' ? P : never]: T[P]['default'];
};
type DerivedCommonState<T extends Record<string, ConfigItem<any>>> = {
    [P in keyof T as T[P]['partition'] extends 'common' ? P : never]: T[P]['default'];
};

type StateSubscriber<TConfig extends Record<string, ConfigItem<any>>> = {
    keys?: Array<keyof DerivedState<TConfig>>;
    callback: (changes: StateUpdate<TConfig>) => void;
}

type CrannAgent<TConfig extends Record<string, ConfigItem<any>>> = {
    get: () => DerivedCommonState<TConfig> & DerivedInstanceState<TConfig>;
    set: (update: StateUpdate<TConfig>) => void;
    subscribe: (callback: (changes: StateUpdate<TConfig>) => void, keys?: Array<keyof TConfig>) => number;
    unsubscribe: (id: number) => void;
}

type AgentSubscription<TConfig extends Record<string, ConfigItem<any>>> = {
    (callback: (changes: StateUpdate<TConfig>) => void, key?: keyof DerivedState<TConfig>): number;
}

type StateUpdate<TConfig extends Record<string, ConfigItem<any>>> = Partial<DerivedState<TConfig>>;

export { ConfigItem, DerivedState, DerivedInstanceState, DerivedCommonState, StateSubscriber, CrannAgent, AgentSubscription, StateUpdate, DerivedState as State };
