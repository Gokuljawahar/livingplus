// Runs a real PostgreSQL server from npm binaries (embedded-postgres), so local
// development and tests need no system install, Docker, or admin rights.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
export async function startLocalPostgres(options) {
    const user = options.user ?? 'livingplus';
    const password = options.password ?? 'livingplus';
    const dir = path.resolve(options.dir);
    const server = new EmbeddedPostgres({
        databaseDir: dir,
        port: options.port,
        user,
        password,
        persistent: options.persistent,
        autoRehydrateSymlinks: true,
        onLog: () => undefined,
        onError: (error) => console.error('[local-postgres]', error)
    });
    if (!fs.existsSync(path.join(dir, 'PG_VERSION')))
        await server.initialise();
    await server.start();
    try {
        await server.createDatabase(options.database);
    }
    catch (error) {
        if (!/already exists/i.test(String(error?.message || error))) {
            await server.stop();
            throw error;
        }
    }
    return {
        url: `postgresql://${user}:${encodeURIComponent(password)}@localhost:${options.port}/${options.database}`,
        stop: () => server.stop()
    };
}
//# sourceMappingURL=local-postgres.js.map