import { ConfigItem, CrannAgent, DerivedState, StateSubscriber, DerivedInstanceState, DerivedCommonState, ConnectReturn, UseCrann } from "./model/crann.model";
import { connect as connectPorter } from 'porter-source'

let crannInstance: unknown = null;

export function connect<TConfig extends Record<string, ConfigItem<any>>>(config: TConfig, context?: string): ConnectReturn<TConfig> {
    if (crannInstance) {
        return crannInstance as ConnectReturn<TConfig>;
    }
    console.log('Crann connect, connecting porter');
    const [post, setMessages] = connectPorter({ namespace: 'crann' });
    console.log('Crann connect, porter connected (hopefully)');
    let _state = getDerivedState(config);
    let changes: Partial<DerivedState<TConfig>> | null = null;
    const listeners = new Set<StateSubscriber<TConfig>>();
    setMessages({
        stateUpdate: (message) => {
            console.log('Crann, handleMessage, state update message received');
            changes = message.payload.state;
            _state = { ..._state, ...changes };
            if (!!changes) {
                console.log('Crann, handle state update message, notifying listeners: ', listeners);
                listeners.forEach(listener => {
                    if (listener.keys === undefined) {
                        console.log('Crann, listener keys undefined, calling callback function');
                        listener.callback(changes!);
                    } else {
                        console.log('Crann, checking if we havev a listener match');
                        const matchFound = listener.keys.some(key => changes!.hasOwnProperty(key))
                        console.log('Crann, state update, matchFound? ', matchFound);
                        matchFound && listener.callback(changes!);
                    }
                });
            }
        }
    });

    console.log('Crann connect, messages set on porter');

    const get = () => _state;
    const set = (newState: Partial<DerivedState<TConfig>>) => {
        post({ action: 'setState', payload: { state: newState } });
    }
    const subscribe = (callback: (changes: Partial<DerivedState<TConfig>>) => void, keys?: Array<keyof DerivedState<TConfig>>): () => void => {
        const listener = { keys, callback };
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        }
    }

    const useCrann: UseCrann<TConfig> = <K extends keyof DerivedState<TConfig>>(
        key: K
    ) => {
        const getValue = () => get()[key] as (DerivedState<TConfig>);
        const setValue = (value: DerivedState<TConfig>[K]) =>
            set({ [key]: value } as Partial<DerivedState<TConfig>>);
        const subscribeToChanges = (callback: (value: DerivedState<TConfig>[K]) => void) => {
            return subscribe((changes) => {
                if (key in changes) {
                    callback(changes[key] as DerivedState<TConfig>[K]);
                }
            }, [key]);
        };

        return [getValue(), setValue, subscribeToChanges];
    }

    const instance: ConnectReturn<TConfig> = [useCrann, get, set, subscribe];
    crannInstance = instance;

    return crannInstance as ConnectReturn<TConfig>;
};

export function connected(): boolean {
    return crannInstance !== null;
}

function getDerivedState<TConfig extends Record<string, ConfigItem<any>>>(config: TConfig): (DerivedState<TConfig>) {
    const instanceState = {} as DerivedInstanceState<TConfig>;

    Object.keys(config).forEach(key => {
        const item: ConfigItem<any> = config[key];
        if (item.partition === 'instance') {
            instanceState[key as keyof DerivedInstanceState<TConfig>] = item.default;
        }
    });

    const commonState = {} as DerivedCommonState<TConfig>;
    Object.keys(config).forEach(key => {
        const item: ConfigItem<any> = config[key];
        if (item.partition === 'instance') {
            commonState[key as keyof DerivedCommonState<TConfig>] = item.default;
        }
    });

    return { ...instanceState, ...commonState } as unknown as (DerivedState<TConfig>);
}
