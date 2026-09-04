/**
 * Produces the ADMIN_PASSWORD_HASH value for a console login.
 *
 * The plaintext password is never stored anywhere -- not in the database, not
 * in the environment. Only this scrypt digest is, and it is useless without the
 * password that produced it.
 *
 *   npm run admin:hash -- 'the password'
 *
 * Passing the password as an argument puts it in shell history; pass nothing
 * and it is read from stdin instead, which is the better habit:
 *
 *   read -rs PW && printf '%s' "$PW" | npm run admin:hash
 */
import { hashPassword } from '../src/lib/server/admin/password.ts';

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

const fromArgv = process.argv.slice(2).join(' ').trim();
const password = fromArgv || (await readStdin());

if (!password) {
	console.error('No password supplied. Pass one as an argument or pipe it on stdin.');
	process.exit(1);
}
if (password.length < 12) {
	// Not a style preference: this single credential mints licences and revokes
	// seats, and scrypt only buys time against a guess that has to be made.
	console.error('Use at least 12 characters. This is the only credential guarding the console.');
	process.exit(1);
}

console.log(`\nADMIN_PASSWORD_HASH=${await hashPassword(password)}\n`);
