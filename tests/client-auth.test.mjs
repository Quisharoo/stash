import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
for (const hostname of ['localhost', '127.0.0.1', 'stash.example.test']) {
  test(`web app requires a session on ${hostname}, even with a legacy configured user`, async () => {
    const context = { CONFIG: { SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'public-key', USER_ID: 'legacy-user' },
      window: { location: { hostname }, supabase: { createClient: () => ({ auth: {
        getSession: async () => ({ data: { session: null } }), onAuthStateChange() {},
      } }) } } };
    vm.createContext(context);
    vm.runInContext(source.replace('const app = new StashApp();', 'globalThis.App = StashApp;'), context);
    const app = Object.create(context.App.prototype);
    app.loadTheme = () => {};
    app.bindEvents = () => {};
    let shown = null;
    app.showAuthScreen = () => { shown = 'login'; };
    app.showMainScreen = () => { throw new Error('unauthenticated main screen'); };
    app.loadData = () => { throw new Error('unauthenticated data access'); };
    await app.init();
    assert.equal(shown, 'login');
  });
}
