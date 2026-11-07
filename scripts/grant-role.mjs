// Local operator command; no public endpoint can promote an account to admin.
import { db } from '../src/lib/db.ts';
import { randomUUID } from 'node:crypto';

const [username, role] = process.argv.slice(2);
if (!username || !['admin', 'student'].includes(role)) {
  console.error('Usage: npm run admin:grant -- USERNAME admin|student');
  process.exit(1);
}
const connection=db();
const user=connection.prepare('SELECT id FROM users WHERE username=?').get(username.toLowerCase());
if (!user) { console.error('Account not found. Register through the app first.'); process.exit(1); }
connection.exec('BEGIN IMMEDIATE');
try {
  connection.prepare('UPDATE users SET role=? WHERE id=?').run(role,user.id);
  connection.prepare('INSERT INTO audit_log VALUES(?,?,?,?,?)').run(randomUUID(),user.id,'operator.role.'+role,user.id,Date.now());
  connection.exec('COMMIT');
  console.log('Role updated. Reload the dashboard to use the new role.');
} catch(error) {connection.exec('ROLLBACK'); throw error;}
