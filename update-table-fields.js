// 一次性脚本：把"费用提报表"的"发票图片"和"附件"字段从 longText 改为 attachment
// 运行方式: TEABLE_TOKEN=xxx node update-table-fields.js
// 注意：此脚本会删除旧字段再重建同名 attachment 字段，该列历史数据将被清空
const TEABLE_BASE = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN = process.env.TEABLE_TOKEN;
const TABLE_SUBMIT = 'tbl3uasnN8YG32UAZ6z';
const FIELDS_TO_CONVERT = ['发票图片', '附件'];

if (!TEABLE_TOKEN) {
  console.error('请设置环境变量 TEABLE_TOKEN');
  console.error('例: TEABLE_TOKEN=xxx node update-table-fields.js');
  process.exit(1);
}

async function api(method, path, body) {
  const opts = { method, headers: { Authorization: `Bearer ${TEABLE_TOKEN}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${TEABLE_BASE}${path}`, opts);
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    console.error(`FAIL ${method} ${path}: ${res.status}`, data);
    process.exit(1);
  }
  return data;
}

async function main() {
  console.log('读取费用提报表字段...');
  const fields = await api('GET', `/api/table/${TABLE_SUBMIT}/field`);
  console.log(`  共 ${fields.length} 个字段`);

  for (const name of FIELDS_TO_CONVERT) {
    const field = fields.find(f => f.name === name);
    if (!field) {
      console.warn(`  [跳过] 字段"${name}"不存在`);
      continue;
    }
    if (field.type === 'attachment') {
      console.log(`  [已是附件] 字段"${name}" (${field.id})`);
      continue;
    }
    console.log(`\n转换"${name}"  ${field.type} → attachment`);
    console.log(`  删除旧字段 ${field.id}...`);
    await api('DELETE', `/api/table/${TABLE_SUBMIT}/field/${field.id}`);
    console.log(`  新建 attachment 字段...`);
    const newField = await api('POST', `/api/table/${TABLE_SUBMIT}/field`, {
      name,
      type: 'attachment',
    });
    console.log(`  ✓ 完成，新字段 ID: ${newField.id}`);
  }

  console.log('\n全部完成 ✓');
}

main().catch(e => { console.error(e); process.exit(1); });
