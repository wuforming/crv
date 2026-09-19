#!/usr/bin/env bash
# 构造演示仓库 /tmp/crv-demo：main → develop → feature-x，覆盖 修改/新增/删除/重命名
set -euo pipefail

REPO=/tmp/crv-demo
rm -rf "$REPO" && mkdir -p "$REPO/src" "$REPO/service" && cd "$REPO"
git init -q -b main
git config user.email crv@demo.local
git config user.name crv

cat > README.md <<'EOF'
# Demo Service
订单演示服务。
EOF

cat > src/utils.ts <<'EOF'
export function formatAmount(cents: number): string {
  const yuan = cents / 100;
  return `¥${yuan.toFixed(2)}`;
}

export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
EOF

cat > src/App.tsx <<'EOF'
import { formatAmount } from './utils';

export function AmountText({ cents }: { cents: number }) {
  return <span data-testid="amount">{formatAmount(cents)}</span>;
}
EOF

cat > src/legacy.js <<'EOF'
// 旧脚本，develop 上创建，feature-x 会删掉它
module.exports = { legacyFlag: true };
EOF

cat > service/OrderService.java <<'EOF'
package service;

import java.math.BigDecimal;
import java.util.List;

public class OrderService {

    private final PricingClient pricingClient;

    public OrderService(PricingClient pricingClient) {
        this.pricingClient = pricingClient;
    }

    public BigDecimal totalOf(List<OrderLine> lines) {
        BigDecimal total = BigDecimal.ZERO;
        for (OrderLine line : lines) {
            total = total.add(line.unitPrice().multiply(BigDecimal.valueOf(line.qty())));
        }
        return total;
    }

    public void refund(String orderId) {
        // TODO: 对接退款网关
        throw new UnsupportedOperationException("not implemented");
    }
}
EOF

git add -A && git commit -qm 'init: 基础工具与订单服务'

git checkout -qb develop
cat >> src/utils.ts <<'EOF'

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}
EOF
git add -A && git commit -qm 'feat(utils): slugify'

git checkout -qb feature-x develop

# 1) 修改 utils.ts：多行改动，适合词级高亮验证
cat > src/utils.ts <<'EOF'
export function formatAmount(cents: number): string {
  const yuan = cents / 1000;
  return `¥${yuan.toFixed(3)}`;
}

export function clamp(v: number, min: number, max: number): number {
  if (min > max) throw new RangeError('min > max');
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}
EOF

# 2) 新文件 api.ts
cat > src/api.ts <<'EOF'
export const API_BASE = '/api/v2';

export async function fetchOrder(id: string) {
  const res = await fetch(`${API_BASE}/orders/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
EOF

# 3) 删除 legacy.js
git rm -q src/legacy.js

# 4) Java：方法内多处修改 + 新方法
python3 - <<'PYEOF'
p = 'service/OrderService.java'
s = open(p).read()
s = s.replace('BigDecimal.valueOf(line.qty())', 'line.qty())\n            // 数量按含税价计')
old_refund = 'public void refund(String orderId) {\n        // TODO: 对接退款网关\n        throw new UnsupportedOperationException("not implemented");\n    }'
new_refund = (
    'public RefundResult refund(String orderId, RefundPolicy policy) {\n'
    '        Order order = repository.find(orderId);\n'
    '        BigDecimal amount = policy.apply(order);\n'
    '        gateway.submit(orderId, amount);\n'
    '        return RefundResult.ok(orderId, amount);\n'
    '    }\n'
    '\n'
    '    public BigDecimal discountOf(Order order, Coupon coupon) {\n'
    '        return coupon.rate().multiply(order.total());\n'
    '    }'
)
s = s.replace(old_refund, new_refund)
open(p, 'w').write(s)
PYEOF

# 5) 重命名 App.tsx → AmountView.tsx 并小改
git mv src/App.tsx src/AmountView.tsx
python3 - <<'PYEOF'
p = 'src/AmountView.tsx'
s = open(p).read()
s = s.replace('data-testid="amount"', 'className="amount" data-testid="amount"')
open(p, 'w').write(s)
PYEOF

git add -A
git commit -qm 'feat: 金额单位改为千分位、退款流程落地、新增 API 客户端'

echo "demo repo ready: $REPO"
git log --oneline --all | head -5
