import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['tests/**/*.test.ts'],
  // 缺配置的用例也不能读取开发者真实设置；需要配置的测试显式注入受控值。
  env: {
    KANVI_SETTINGS_FILE: join(tmpdir(), `kanvi-test-settings-${randomUUID()}`, 'settings.json'),
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_MODEL: '',
  },
} });
