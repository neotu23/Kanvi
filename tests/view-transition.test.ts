import { expect, it } from 'vitest';
import { createPreviewSwapper, type NativeViewTransition, type ViewTransitionEnv } from '../src/components/view-transition';

function fakeEnv(options: { supported?: boolean; reducedMotions?: boolean } = {}) {
  const log: string[] = [];
  const controllers: { resolve: () => void; reject: (error: Error) => void }[] = [];
  let skipped = 0;
  const start = (update: () => Promise<void>) => {
    log.push('capture-old');
    void update().then(
      () => log.push('update-done'),
      (error: Error) => log.push(`update-failed:${error.message}`),
    );
    const finished = new Promise<void>((resolve, reject) => { controllers.push({ resolve, reject }); });
    return { finished, skipTransition: () => { skipped += 1; log.push('skip'); } } satisfies NativeViewTransition;
  };
  const env: ViewTransitionEnv = { reducedMotions: options.reducedMotions ?? false, start: options.supported === false ? undefined : start };
  return { env, log, controllers, skipped: () => skipped };
}

it('浏览器支持时先换 DOM、再等新正文量好，浏览器才抓取新画面', async () => {
  const fake = fakeEnv();
  const swapper = createPreviewSwapper(fake.env);
  expect(swapper.native).toBe(true);
  let release: () => void = () => {};
  const run = swapper.run({
    apply: () => fake.log.push('apply'),
    settle: () => { fake.log.push('settle'); return new Promise<void>(resolve => { release = resolve; }); },
  });
  expect(fake.log).toEqual(['capture-old', 'apply', 'settle']);
  expect(fake.log).not.toContain('update-done');
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(fake.log).toContain('update-done');
  fake.controllers[0].resolve();
  await run;
});

it('浏览器不支持时立刻替换正文，自己淡入不叠加原生过渡', async () => {
  const fake = fakeEnv({ supported: false });
  const swapper = createPreviewSwapper(fake.env);
  expect(swapper.native).toBe(false);
  let settled = false;
  await swapper.run({ apply: () => fake.log.push('apply'), settle: async () => { settled = true; } });
  expect(fake.log).toEqual(['apply']);
  expect(settled).toBe(false);
  expect(fake.controllers).toHaveLength(0);
});

it('用户要求减少动效时同样走自己的淡入淡出', async () => {
  const fake = fakeEnv({ reducedMotions: true });
  const swapper = createPreviewSwapper(fake.env);
  expect(swapper.native).toBe(false);
  await swapper.run({ apply: () => fake.log.push('apply'), settle: async () => { fake.log.push('settle'); } });
  expect(fake.log).toEqual(['apply']);
});

it('连续换主题时跳过上一次没结束的过渡，正文以最后一次为准', async () => {
  const fake = fakeEnv();
  const swapper = createPreviewSwapper(fake.env);
  void swapper.run({ apply: () => fake.log.push('first'), settle: () => new Promise<void>(() => {}) });
  const second = swapper.run({ apply: () => fake.log.push('second'), settle: async () => {} });
  await Promise.resolve();
  expect(fake.log).toEqual(['capture-old', 'first', 'skip', 'capture-old', 'second']);
  expect(fake.skipped()).toBe(1);
  fake.controllers[1].resolve();
  await second;
});

it('浏览器放弃过渡时正文仍然换好，也不向调用方抛错', async () => {
  const fake = fakeEnv();
  const swapper = createPreviewSwapper(fake.env);
  const run = swapper.run({ apply: () => fake.log.push('apply'), settle: async () => {} });
  await Promise.resolve();
  fake.controllers[0].reject(new Error('skipped'));
  await expect(run).resolves.toBeUndefined();
  expect(fake.log).toContain('apply');
});

it('组件卸载时取消进行中的过渡', () => {
  const fake = fakeEnv();
  const swapper = createPreviewSwapper(fake.env);
  void swapper.run({ apply: () => {}, settle: () => new Promise<void>(() => {}) });
  swapper.cancel();
  expect(fake.skipped()).toBe(1);
});
