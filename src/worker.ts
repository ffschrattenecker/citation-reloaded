import registerPromiseWorker from 'promise-worker/register';

import { loadEntries } from './load-entries';
import { DatabaseType, EntryData } from './types';

registerPromiseWorker(
  (msg: { databaseRaw: string; databaseType: DatabaseType }): EntryData[] => {
    return loadEntries(msg.databaseRaw, msg.databaseType);
  },
);
