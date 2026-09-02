// One-off schedule sync from the command line: `npm run sync`
import { DB } from '../db.js';
import { ScheduleService } from './scheduleService.js';
const db = new DB();
const svc = new ScheduleService({ db });
const changes = await svc.sync();
db.flush();
console.log(JSON.stringify({ games: svc.all().length, source: svc.meta.source, lastError: svc.meta.lastError, changes: changes.length }, null, 2));
