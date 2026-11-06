# Sign-in and live sync in the browser, against the fake Firebase build (node test/build-fake.mjs -> www-test/).
# Run with the server: python3 -m http.server 8767 --directory www-test
import os
import sys
from datetime import datetime, timezone, timedelta

from playwright.sync_api import sync_playwright

URL = os.environ.get('MIAAD_TEST_URL', 'http://localhost:8767/index.html')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
CAIRO = timezone(timedelta(hours=3))
START = datetime(2026, 10, 25, 10, 0, tzinfo=CAIRO)
USER = {'uid': 'u1', 'email': 'jimy@example.com', 'displayName': 'Jimy Soliman', 'photoURL': ''}

checks, errors = [], []


def check(name, cond):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name)


def shot(page, name):
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(OUT, name + '.png'))


def new_page(b, scheme='light'):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='ar-EG', timezone_id='Africa/Cairo', color_scheme=scheme)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time=START)
    return ctx, page


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---- device 1: skip first, sign in later from Settings
    ctx, page = new_page(b)
    page.goto(URL)
    page.wait_for_selector('.welcome')
    check('first run shows the sign-in screen', page.locator('.welcome h1').inner_text() == 'أهلاً بيك في ميعاد')
    check('tabs and + hidden on the sign-in screen', not page.locator('.tabs').is_visible() and not page.locator('.fab').is_visible())
    shot(page, 'c01-welcome')
    page.click('[data-act="skip-sign-in"]')
    page.wait_for_selector('.task')
    check('skip shows the app with examples', page.locator('.task').count() == 4)
    # headless Chromium reports notifications as already refused: the web app then stays quiet about it
    check('no notification nag once the browser refused', page.locator('.banner.is-warn [data-act="notif-ask"]').count() == 0)
    page.click('.tab[data-tab="settings"]')
    page.wait_for_selector('.acct')
    check('settings offers Google sign-in', page.locator('.acct [data-act="sign-in"]').count() == 1)
    shot(page, 'c02-settings-signed-out')
    page.evaluate('u => { window.__miaadFake.nextUser = u; }', USER)
    page.click('.acct [data-act="sign-in"]')
    page.wait_for_selector('.acct-who')
    who = page.locator('.acct-who').inner_text()
    check(f'account card shows the user ({who!r})', 'jimy@example.com' in who and 'Jimy Soliman' in who)
    page.wait_for_timeout(300)
    status = page.locator('.sync-l').inner_text()
    check(f'sync status shown ({status!r})', 'متزامن' in status)
    toasts = ' | '.join(page.locator('.toast').all_inner_texts())
    check(f'signed-in toast ({toasts!r})', 'دخلت بحساب' in toasts)
    shot(page, 'c03-settings-signed-in')
    examples_in_cloud = page.evaluate("Object.values((window.__miaadFake.server.get('users/u1') || {}).tasks || {}).filter(t => t.example).length")
    check('examples are not uploaded', examples_in_cloud == 0)

    # digest settings
    page.uncheck('#morning-on')
    page.wait_for_timeout(200)
    check('morning summary off disables its time', page.locator('#morning-at').is_disabled())
    page.check('#morning-on')
    page.fill('#evening-at', '22:15')
    page.locator('#evening-at').dispatch_event('change')
    page.wait_for_timeout(200)
    saved = page.evaluate("JSON.parse(localStorage.getItem('miaad.v1')).settings.eveningAt")
    check(f'evening time saved ({saved})', saved == '22:15')
    synced_setting = page.evaluate("window.__miaadFake.server.get('users/u1').settings.eveningAt")
    check('setting reached the account', synced_setting == '22:15')

    # add a task here, then one "from the laptop"
    page.click('.tab[data-tab="today"]')
    page.click('.fab')
    page.wait_for_selector('#task-form')
    page.fill('input[name="title"]', 'مراجعة ملف التسويات')
    page.fill('input[name="time"]', '12:00')
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(400)
    in_cloud = page.evaluate("Object.values(window.__miaadFake.server.get('users/u1').tasks).map(t => t.title)")
    check(f'new task saved to the account ({in_cloud})', 'مراجعة ملف التسويات' in in_cloud)
    page.evaluate("""() => window.__miaadFake.remoteSet('users/u1', ['tasks', 'r1'], {
        id: 'r1', title: 'مكالمة البنك الأهلي', date: '2026-10-25', time: '13:30', dur: 0, remind: 10,
        rep: { k: 'none' }, cat: 'work', prio: 1, notes: '', until: '', created: '2026-10-25T07:05:00.000Z' })""")
    page.wait_for_timeout(500)
    titles = page.locator('.task .task-t').all_inner_texts()
    check(f'task added on another device appears live ({titles})', any('مكالمة البنك الأهلي' in t for t in titles))
    page.evaluate("() => window.__miaadFake.remoteSet('users/u1/months/2026-10', ['done', 'r1@2026-10-25'], { at: Date.now() })")
    page.wait_for_timeout(500)
    done_titles = page.locator('.task.st-done .task-t').all_inner_texts()
    check(f'completion from another device appears live ({done_titles})', any('مكالمة البنك الأهلي' in t for t in done_titles))
    check('sync chip in the header', page.locator('.bar .sync-chip.s-synced').count() == 1)
    shot(page, 'c04-today-synced')

    # sign out: back to the first-run screen, nothing left locally
    page.click('.tab[data-tab="settings"]')
    page.click('[data-act="sign-out-ask"]')
    page.wait_for_selector('.confirm [data-act="sign-out"]')
    shot(page, 'c05-signout-confirm')
    page.click('.confirm [data-act="sign-out"]')
    page.wait_for_selector('.welcome', timeout=8000)
    left = page.evaluate("JSON.parse(localStorage.getItem('miaad.v1')).tasks.length")
    check(f'signed out: welcome again and no tasks on the device ({left})', left == 0)
    ctx.close()

    # ---- device 2 (dark): sign in straight from the first-run screen
    ctx, page = new_page(b, 'dark')
    # this device has not answered the notification question yet
    page.add_init_script("Object.defineProperty(Notification, 'permission', { get: () => 'default' })")
    page.goto(URL)
    page.wait_for_selector('.welcome')
    shot(page, 'c06-welcome-dark')
    page.evaluate('u => { window.__miaadFake.nextUser = u; }', USER)
    page.click('.welcome [data-act="sign-in"]')
    page.wait_for_selector('.bar .sync-chip', timeout=8000)
    check('sign-in from the first screen opens Today', page.locator('.welcome').count() == 0)
    check('no examples after signing in', page.locator('.task').count() == 0)
    check('notifications-off banner offers the fix', page.locator('.banner.is-warn [data-act="notif-ask"]').count() == 1)
    page.reload()
    page.wait_for_selector('.view')
    page.wait_for_timeout(400)
    check('stays signed in after reload (no welcome)', page.locator('.welcome').count() == 0)
    page.wait_for_selector('.bar .sync-chip', timeout=5000)
    check('no demo tasks appear on a signed-in device after reload', page.locator('.task').count() == 0)
    shot(page, 'c07-today-dark-signed-in')
    over = page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
    check('no horizontal overflow', not over)
    ctx.close()
    b.close()

print('console errors:', errors[:10])
bad = [n for n, ok in checks if not ok]
print(f'{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad or errors else 0)
