import type {Logger} from '../../logger.js';
import type {InternalConnection, InternalConnectOptions} from '../connection.js';
import {loadInternalConfig} from './loadInternalConfig.js';
import {resolvePasskey} from './resolvePasskey.js';
import {createTransferHandle} from '../transfer/TransferHandle.js';
import type {EventBus} from '../../events/EventBus.js';
import {createConnection} from '../createConnection.js';
import {createClientLocale} from '../../translation/clientLocale.js';

export async function connectInternal(
    eventBus: EventBus,
    options: InternalConnectOptions,
    log: Logger,
    bootLog: Logger
): Promise<InternalConnection> {
    bootLog = bootLog.withPrefix('Internal');
    const config = loadInternalConfig(options, bootLog);

    const locale = createClientLocale(log, config, options.locale);

    const transfer = createTransferHandle(
        config,
        locale,
        {
            'X-CSRF-TOKEN': config.secrets.csrfToken
        },
        log,
        eventBus
    );

    const passkey = await resolvePasskey(transfer, config, options, bootLog);

    return createConnection<InternalConnection>(
        config,
        passkey,
        locale,
        eventBus,
        log,
        transfer
    );
}
