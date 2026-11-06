# UI flow test on a phone-sized viewport with a controlled clock. Saves screenshots to test/shots/.
import json
import os
import sys
from datetime import datetime, timezone, timedelta

from playwright.sync_api import sync_playwright

URL = os.environ.get('MIAAD_URL', 'http://localhost:8765/index.html')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
CAIRO = timezone(timedelta(hours=3))  # Egypt summer time (EEST) in late October 2026
START = datetime(2026, 10, 24, 10, 0, tzinfo=CAIRO)

errors = []
checks = []


def check(name, cond):
    checks.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name)


def shot(page, name):
    page.wait_for_timeout(350)
    page.screenshot(path=os.path.join(OUT, name + '.png'))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='ar-EG', timezone_id='Africa/Cairo', color_scheme='light')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.clock.install(time=START)
    page.goto(URL)
    page.wait_for_selector('.task')
    shot(page, '01-today-examples')
    check('examples seeded (4 tasks)', page.locator('.task').count() == 4)
    check('hero shows a countdown', page.locator('.hero-cd').count() == 1)
    check('one overdue example', page.locator('.task.st-overdue').count() == 1)

    # clear the examples, then add a real task
    page.click('[data-act="clear-examples"]')
    page.wait_for_timeout(300)
    check('examples cleared', page.locator('.task').count() == 0)
    shot(page, '02-empty')

    page.click('.fab')
    page.wait_for_selector('#task-form')
    page.fill('input[name="title"]', 'مراجعة تسويات البنك الأهلي')
    page.fill('input[name="time"]', '11:30')
    page.click('label.chip:has(input[name="remind"][value="10"])')
    page.click('label.chip:has(input[name="cat"][value="work"])')
    page.click('label.chip:has(input[name="prio"][value="1"])')
    page.click('label.chip:has(input[name="dur"][value="45"])')
    shot(page, '03-editor')
    page.click('#task-form button[type="submit"]')
    page.wait_for_timeout(400)
    check('task saved', page.locator('.task').count() == 1)
    pill = page.locator('.task .pill').inner_text()
    check(f'countdown pill shows ~1:30 ({pill!r})', '1:29:' in pill or '1:30:' in pill)

    # a daily task without time + a recurring timed task
    for title, time, rep in (('ورد الصباح', None, 'daily'), ('تمرين', '18:00', 'days')):
        page.click('.fab')
        page.wait_for_selector('#task-form')
        page.fill('input[name="title"]', title)
        if time:
            page.fill('input[name="time"]', time)
        else:
            page.click('label.check:has(input[name="notime"])')
        page.click(f'label.chip:has(input[name="rep"][value="{rep}"])')
        page.click('#task-form button[type="submit"]')
        page.wait_for_timeout(300)
    check('three tasks today', page.locator('.task').count() == 3)
    shot(page, '04-today')

    # time passes: 11:45 -> the 11:30 task is overdue
    page.clock.fast_forward('01:45:00')
    page.wait_for_timeout(600)
    check('task became overdue', page.locator('.task.st-overdue').count() == 1)
    shot(page, '05-overdue')

    # open the detail sheet and mark done (late by 15 min)
    page.click('.task.st-overdue .task-main')
    page.wait_for_selector('.detail')
    shot(page, '06-detail')
    page.click('.detail [data-act="toggle"]')
    page.wait_for_timeout(500)
    toasts = ' | '.join(page.locator('.toast').all_inner_texts())
    check(f'late toast ({toasts!r})', 'اتسجلت متأخرة 15' in toasts)
    check('done task listed', page.locator('.task.st-done').count() == 1)
    shot(page, '07-done')

    # focus timer: start 25 min on the 6 pm task, run 10 minutes
    page.click('.tab[data-tab="focus"]')
    page.wait_for_selector('.dial')
    page.select_option('select[data-act="focus-pick"]', index=1)
    page.click('[data-act="timer-start"]')
    page.clock.fast_forward('10:00')
    page.wait_for_timeout(500)
    t = page.locator('#dial-time').inner_text()
    check(f'focus timer counts down ({t})', t.startswith('15:0') or t.startswith('14:5'))
    shot(page, '08-focus')
    page.clock.fast_forward('16:00')
    page.wait_for_timeout(600)
    check('focus finished and logged', page.locator('.plain li').count() >= 1)
    shot(page, '09-focus-done')

    # next day: log shows yesterday
    page.clock.fast_forward('20:00:00')
    page.wait_for_timeout(800)
    page.click('.tab[data-tab="log"]')
    page.wait_for_selector('.kpis')
    shot(page, '10-log')
    check('log has day groups', page.locator('.logday').count() >= 1)

    page.click('.tab[data-tab="today"]')
    page.wait_for_timeout(300)
    shot(page, '11-next-day')

    page.click('.tab[data-tab="settings"]')
    page.wait_for_selector('.set')
    shot(page, '12-settings')
    page.click('[data-act="set-theme"][data-v="dark"]')
    page.click('.tab[data-tab="today"]')
    page.wait_for_timeout(300)
    shot(page, '13-today-dark')
    page.click('.tab[data-tab="settings"]')
    page.click('[data-act="set-lang"][data-v="en"]')
    page.click('.tab[data-tab="today"]')
    page.wait_for_timeout(300)
    shot(page, '14-today-en-dark')
    check('english layout is ltr', page.evaluate('document.documentElement.dir') == 'ltr')

    # persistence: reload keeps the data
    n_before = page.evaluate("JSON.parse(localStorage.getItem('miaad.v1')).tasks.filter(t => !t.deleted).length")
    page.reload()
    page.wait_for_selector('.view')
    n_after = page.evaluate("JSON.parse(localStorage.getItem('miaad.v1')).tasks.filter(t => !t.deleted).length")
    check(f'data persists across reload ({n_before} -> {n_after})', n_before == n_after == 3)
    overflow = page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
    check('no horizontal overflow', not overflow)
    b.close()

print('console errors:', errors[:10])
bad = [n for n, ok in checks if not ok]
print(f'{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad or errors else 0)
