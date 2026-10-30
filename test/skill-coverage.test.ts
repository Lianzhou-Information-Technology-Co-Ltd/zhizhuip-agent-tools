import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ToolDef } from '../src/types.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const skillRoot = resolve(root, 'skills/zhizhuip');
const read = (path: string): string => readFileSync(path, 'utf8');
const tools = JSON.parse(read(resolve(root, 'spec/tools.json'))) as ToolDef[];
const map = read(resolve(skillRoot, 'references/tool-map.md'));

/**
 * 收集 Skill 内的 Markdown 文件，检查入口和引用文档是否完整。
 * @param dir 要扫描的技能目录。
 * @return Markdown 文件的绝对路径集合。
 */
function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : [];
  });
}

describe('Skill 覆盖与分发完整性', () => {
  it('每个 MCP 工具恰有一条包含产品、后端入口和可读取流程的覆盖记录', () => {
    const rows = map.split('\n').filter(line => /^\| `[a-z0-9_]+` \|/.test(line));
    const names = rows.map(row => row.match(/^\| `([a-z0-9_]+)`/)![1]);
    expect(names.sort()).toEqual(tools.map(tool => tool.name).sort());
    const groups: Record<string, string[]> = {
      D: ['dynamic-no-expiry', 'dynamic-monthly'], S: ['static-standard', 'static-native', 'static-isp-native'],
      V: ['static-ipv6'], C: ['datacenter'], B: ['dynamic-bandwidth'],
    };
    groups.A = Object.values(groups).flat();
    for (const tool of tools) {
      const row = rows.find(line => line.startsWith(`| \`${tool.name}\` |`))!;
      const columns = row.split('|').map(part => part.trim());
      expect(columns[3], tool.name).toBe(`\`${tool.path.replace('/externalapi/', '')}\``);
      expect(columns[4], tool.name).toMatch(/\[[^\]]+\]\([^)]+\.md(?:#[^)]+)?\)/);
      if (tool.products) {
        expect(columns[2].split('/').flatMap(code => groups[code] ?? []).sort(), tool.name)
          .toEqual(Object.keys(tool.products).sort());
      } else if (tool.fixed?.product_type_id === 11) expect(columns[2], tool.name).toBe('B');
      else if (tool.fixed?.version === 6) expect(columns[2], tool.name).toBe('V');
      else expect(columns[2], tool.name).toBe('通用');
    }
  });

  it('Skill 的本地引用路径与章节均存在，不依赖维护者绝对目录', () => {
    for (const file of markdownFiles(skillRoot)) {
      const content = read(file);
      expect(content, file).not.toMatch(/[A-Z]:[\\/]projects/);
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        if (/^https?:/.test(match[1])) continue;
        const [relative, anchor] = match[1].split('#');
        const target = resolve(dirname(file), relative || '.');
        expect(target.startsWith(skillRoot), match[1]).toBe(true);
        const targetText = read(target);
        if (anchor) {
          const headings = [...targetText.matchAll(/^#+\s+(.+)$/gm)].map(item => item[1].trim()
            .toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-'));
          expect(headings, `${file}: ${match[1]}`).toContain(anchor);
        }
      }
    }
  });

  it('npm 包同时携带 Skill、运行资源及安装器，不依赖仅存在于源码目录的文件', () => {
    const pkg = JSON.parse(read(resolve(root, 'package.json')));
    expect(pkg.files).toEqual(expect.arrayContaining(['dist/src', 'spec/tools.json', 'spec/dynamic-proxy-session.md', 'skills/zhizhuip']));
  });
});
