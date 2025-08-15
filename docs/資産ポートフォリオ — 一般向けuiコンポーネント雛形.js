import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ComposedChart, Bar, Line } from "recharts";
import { Download, Undo2, Plus, Link as LinkIcon, FileDown, Sparkles, Settings2, SlidersHorizontal, Wand2, Scale, BarChart3, UploadCloud, Pencil } from "lucide-react";
// shadcn/ui primitives — these imports assume your project has shadcn installed
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

/**
 * 一般向けUI雛形（コンプ／リバランス／編集統一）
 * - API結線ポイントは TODO コメントを検索
 * - Recharts / shadcn/ui / framer-motion / lucide-react を使用
 * - TailwindCSS 前提のスタイリング
 */

// ---------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------
const fmtJPY = (n) => new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(n || 0);
const clamp = (v, min=0, max=100) => Math.min(Math.max(v, min), max);

function normalizeAllocations(obj) {
  const total = Object.values(obj).reduce((a, b) => a + (Number(b) || 0), 0);
  if (total === 0) return obj;
  const norm = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, (v / total) * 100]));
  return norm;
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(x => typeof x === "string" && x.includes(",") ? `"${x.replace(/"/g, '""')}"` : x).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// 擬似チャート色（Tailwindに合う中庸カラー）
const CHART_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#22d3ee", "#a78bfa", "#fb7185", "#10b981"]; 

// ---------------------------------------------------------
// コンポーネント: ドーナツ（現状/目標）
// ---------------------------------------------------------
function Donut({ data }) {
  const entries = Object.entries(data).map(([name, value], i) => ({ name, value: Math.max(0, Number(value) || 0), fill: CHART_COLORS[i % CHART_COLORS.length] }));
  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={entries} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
            {entries.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------
// コンポーネント: 箱ひげ + 推定ライン（簡易）
// ---------------------------------------------------------
function BoxWhisker({ stats }) {
  // stats: { min, q1, median, q3, max, estimate }
  const width = 380, height = 120;
  const pad = 24;
  const min = stats?.min ?? 0; const max = stats?.max ?? 1;
  const scaleX = (v) => pad + ((v - min) / (max - min || 1)) * (width - pad * 2);
  return (
    <svg width={width} height={height} className="text-muted-foreground">
      {/* whiskers */}
      <line x1={scaleX(stats.min)} x2={scaleX(stats.max)} y1={60} y2={60} stroke="currentColor" strokeWidth={2} />
      {/* box */}
      <rect x={scaleX(stats.q1)} y={40} width={Math.max(1, scaleX(stats.q3) - scaleX(stats.q1))} height={40} fill="currentColor" className="opacity-20" />
      {/* median */}
      <line x1={scaleX(stats.median)} x2={scaleX(stats.median)} y1={36} y2={84} stroke="currentColor" strokeWidth={2} />
      {/* estimate */}
      {stats.estimate && (
        <g>
          <line x1={scaleX(stats.estimate)} x2={scaleX(stats.estimate)} y1={26} y2={94} stroke="#0ea5e9" strokeDasharray="4 4" strokeWidth={2} />
          <text x={scaleX(stats.estimate)} y={20} textAnchor="middle" className="fill-sky-500 text-xs">推定</text>
        </g>
      )}
      {/* labels */}
      <text x={pad} y={110} className="text-xs">{fmtJPY(stats.min)}</text>
      <text x={width - pad} y={110} className="text-xs" textAnchor="end">{fmtJPY(stats.max)}</text>
    </svg>
  );
}

// ---------------------------------------------------------
// 参考価格（コンプ） — 一般向けステッパー
// ---------------------------------------------------------
export function ComparableSalesWizard({ assetId }) {
  const [tab, setTab] = useState("collect");
  const [url, setUrl] = useState("");
  const [items, setItems] = useState([]); // {date, currency, price, marketplace, state, box}
  const [mode, setMode] = useState("auto"); // auto|conservative|aggressive
  const [slider, setSlider] = useState(50); // 0..100 （慎重←→幅広く）
  const [note, setNote] = useState("");
  const [lastCommitted, setLastCommitted] = useState(null);

  // 擬似統計（実装時はサーバの推定APIから取得）
  const stats = useMemo(() => {
    if (!items.length) return null;
    const vs = items.map(x => x.price).sort((a,b)=>a-b);
    const q = (p) => vs[Math.floor((vs.length-1)*p)] ?? vs[0];
    const s = { min: vs[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: vs[vs.length-1] };
    s.estimate = s.median; // 仮
    return s;
  }, [items]);

  function parseURL(u) {
    // TODO: 実装ではバックエンドに委譲（抽出不可時は手入力にフォールバック）
    // 簡易ダミー
    const m = u.match(/(\d[\d,]{2,})/);
    const price = m ? Number(m[1].replace(/,/g, "")) : Math.floor(Math.random()*50000)+10000;
    return { date: new Date().toISOString().slice(0,10), currency: "JPY", price, marketplace: "web", state: "used", box: true };
  }

  const onAddFromURL = () => {
    if (!url) return;
    const it = parseURL(url);
    setItems(prev => [it, ...prev]);
    setUrl("");
  };

  const onFiles = async (files) => {
    // TODO: OCR/CSV 解析→items へ push
    for (const f of files) {
      setItems(prev => [{ date: new Date().toISOString().slice(0,10), currency: "JPY", price: 12345, marketplace: f.name, state: "used", box: false }, ...prev]);
    }
  };

  const onCommit = async () => {
    if (!stats) return;
    // TODO: POST /api/assets/:assetId/comps/commit { estimate, confidence, used, removed, note }
    // 成功時: lastCommitted にID 等を保存
    setLastCommitted({ ts: Date.now(), estimate: stats.estimate });
  };

  const onUndo = async () => {
    if (!lastCommitted) return;
    // TODO: 直前の valuations を取り消す API
    setLastCommitted(null);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          <CardTitle>参考価格（コンプ）</CardTitle>
        </div>
        <Badge variant="secondary" className="rounded-full">初心者モード</Badge>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="collect">① 事例を集める</TabsTrigger>
            <TabsTrigger value="estimate">② 推定する</TabsTrigger>
            <TabsTrigger value="commit">③ 評価に反映</TabsTrigger>
          </TabsList>

          {/* 収集 */}
          <TabsContent value="collect" className="pt-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><LinkIcon className="w-4 h-4"/>URL 貼り付け</CardTitle></CardHeader>
                <CardContent className="flex gap-2">
                  <Input placeholder="例：https://..." value={url} onChange={(e)=>setUrl(e.target.value)} />
                  <Button onClick={onAddFromURL} className="whitespace-nowrap"><Plus className="w-4 h-4 mr-1"/>追加</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><UploadCloud className="w-4 h-4"/>CSV / 画像</CardTitle></CardHeader>
                <CardContent>
                  <label className="flex items-center justify-center border border-dashed rounded-xl p-6 text-sm cursor-pointer hover:bg-muted/50">
                    <input type="file" className="hidden" multiple onChange={(e)=>onFiles(Array.from(e.target.files||[]))} />
                    ファイルをドロップまたは選択
                  </label>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm text-muted-foreground">収集した事例</h4>
                <div className="flex gap-2">
                  <Badge className="rounded-full">新品</Badge>
                  <Badge variant="outline" className="rounded-full">中古</Badge>
                  <Badge variant="secondary" className="rounded-full">付属あり</Badge>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {items.map((it, i) => (
                  <div key={i} className="border rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{it.marketplace} <span className="text-muted-foreground">({it.state})</span></div>
                      <div className="text-xs text-muted-foreground">{it.date} ・ {it.currency}</div>
                    </div>
                    <div className="text-right font-semibold">{fmtJPY(it.price)}</div>
                  </div>
                ))}
                {!items.length && <div className="text-sm text-muted-foreground col-span-3">まだ事例がありません。上の入力から追加してください。</div>}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={()=>setTab("estimate")} disabled={!items.length}>次へ</Button>
            </div>
          </TabsContent>

          {/* 推定 */}
          <TabsContent value="estimate" className="pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4"/>推定モード</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2 flex-wrap text-sm">
                    <Button variant={mode==="auto"?"default":"outline"} size="sm" onClick={()=>setMode("auto")}>おまかせ</Button>
                    <Button variant={mode==="conservative"?"default":"outline"} size="sm" onClick={()=>setMode("conservative")}>保守的</Button>
                    <Button variant={mode==="aggressive"?"default":"outline"} size="sm" onClick={()=>setMode("aggressive")}>強気</Button>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">外れ値強度・最近重視（慎重 ←→ 幅広く）</div>
                    <input type="range" min={0} max={100} value={slider} onChange={(e)=>setSlider(Number(e.target.value))} className="w-full" />
                  </div>
                  <p className="text-xs text-muted-foreground">この設定は内部で MAD 除外と重み付け中央値に反映されます。</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4"/>結果</CardTitle></CardHeader>
                <CardContent>
                  {stats ? (
                    <div>
                      <BoxWhisker stats={stats} />
                      <div className="mt-2 text-sm">
                        <div>推定額: <span className="font-semibold text-primary">{fmtJPY(stats.estimate)}</span></div>
                        <div className="text-muted-foreground text-xs">採用 {items.length} 件 / 除外 0 件（ダミー）</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">事例がありません。前のステップに戻ってください。</div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" onClick={()=>setTab("collect")}>戻る</Button>
              <Button onClick={()=>setTab("commit")} disabled={!stats}>次へ</Button>
            </div>
          </TabsContent>

          {/* 反映 */}
          <TabsContent value="commit" className="pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">差分プレビュー</CardTitle></CardHeader>
                <CardContent>
                  {/* TODO: 現評価/簿価をAPIから取得して差分を表示 */}
                  <div className="grid grid-cols-3 gap-2 text-sm items-center">
                    <div className="text-muted-foreground">現評価</div><div className="col-span-2 font-medium">{fmtJPY(250000)}</div>
                    <div className="text-muted-foreground">推定</div><div className="col-span-2 font-medium">{fmtJPY(stats?.estimate || 0)}</div>
                    <div className="text-muted-foreground">差分</div><div className="col-span-2 font-medium text-primary">{fmtJPY((stats?.estimate||0)-250000)}</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">メモ（出典・期間・件数）</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Textarea rows={4} placeholder="例：2025-06〜08 / メルカリ・ヤフオク計12件 / おまかせ推定" value={note} onChange={(e)=>setNote(e.target.value)} />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={onUndo} disabled={!lastCommitted}><Undo2 className="w-4 h-4 mr-1"/>UNDO</Button>
                    <Button onClick={onCommit}><Sparkles className="w-4 h-4 mr-1"/>評価に反映</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="mt-4">
              <Button variant="ghost" onClick={()=>setTab("estimate")}>戻る</Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------
// 配分調整（リバランス） — 一般向けウィザード
// ---------------------------------------------------------
const DEFAULT_CLASSES = ["US株", "日本株", "貴金属", "現金"];

export function RebalanceWizard({ current = { "US株": 40, "日本株": 30, "貴金属": 20, "現金": 10 } }) {
  const [tab, setTab] = useState("targets");
  const [targets, setTargets] = useState({ ...current });
  const [lockIlliquid, setLockIlliquid] = useState(true); // L3/L4除外
  const [tol, setTol] = useState(5); // 許容幅
  const [mode, setMode] = useState("target"); // target | mid
  const [minTrade, setMinTrade] = useState(10000);
  const normalized = useMemo(() => normalizeAllocations(targets), [targets]);

  const onSlider = (k, v) => {
    const draft = { ...targets, [k]: clamp(v, 0, 100) };
    // 一旦セット→描画側で normalize（見た目は%合計=100%）
    setTargets(draft);
  };

  // ダミー計画（実装では /api/rebalance/plan を使用）
  const plan = useMemo(() => {
    const rows = DEFAULT_CLASSES.map((k) => {
      const cur = current[k] || 0; const tgt = normalized[k] || 0;
      const diffPct = tgt - cur; // +買い / -売り
      const jpy = Math.round(Math.abs(diffPct) * 10000); // ダミー計算
      return { className: k, action: diffPct > 0 ? "買" : diffPct < 0 ? "売" : "保留", amountJPY: jpy, diffPct };
    });
    return rows;
  }, [normalized, current]);

  const onExportCSV = () => {
    const rows = [["Class","Action","Diff(%)","Amount(JPY)"]].concat(plan.map(r=>[r.className, r.action, r.diffPct.toFixed(2), r.amountJPY]));
    downloadCSV("rebalance_plan.csv", rows);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2"><SlidersHorizontal className="w-5 h-5"/><CardTitle>配分調整（リバランス）</CardTitle></div>
        <Badge variant="secondary" className="rounded-full">初心者モード</Badge>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="targets">① 目標を決める</TabsTrigger>
            <TabsTrigger value="rules">② ルールを選ぶ</TabsTrigger>
            <TabsTrigger value="plan">③ 提案を見る</TabsTrigger>
          </TabsList>

          {/* 目標 */}
          <TabsContent value="targets" className="pt-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">現状</CardTitle></CardHeader>
                <CardContent><Donut data={current} /></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">目標（自動で合計100%）</CardTitle></CardHeader>
                <CardContent><Donut data={normalized} /></CardContent>
              </Card>
            </div>
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              {DEFAULT_CLASSES.map((k, i) => (
                <div key={i} className="border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{k}</div>
                    <div className="text-sm text-muted-foreground">{(normalized[k]||0).toFixed(1)}%</div>
                  </div>
                  <input type="range" min={0} max={100} value={targets[k]||0} onChange={(e)=>onSlider(k, Number(e.target.value))} className="w-full" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Switch checked={lockIlliquid} onCheckedChange={setLockIlliquid} />
                <span>低流動（L3/L4）を売買対象から外す</span>
              </div>
              <Button onClick={()=>setTab("rules")}><Settings2 className="w-4 h-4 mr-1"/>次へ</Button>
            </div>
          </TabsContent>

          {/* ルール */}
          <TabsContent value="rules" className="pt-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">許容幅（±%）</CardTitle></CardHeader>
                <CardContent className="flex gap-2 flex-wrap">
                  {[3,5,10].map(v => (
                    <Button key={v} variant={tol===v?"default":"outline"} size="sm" onClick={()=>setTol(v)}>{v}%</Button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">方式</CardTitle></CardHeader>
                <CardContent className="flex gap-2 flex-wrap">
                  <Button variant={mode==="target"?"default":"outline"} size="sm" onClick={()=>setMode("target")}>目標まで</Button>
                  <Button variant={mode==="mid"?"default":"outline"} size="sm" onClick={()=>setMode("mid")}>中間まで</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">最小取引額（円）</CardTitle></CardHeader>
                <CardContent>
                  <Input type="number" value={minTrade} onChange={(e)=>setMinTrade(Number(e.target.value)||0)} />
                </CardContent>
              </Card>
            </div>
            <div className="mt-4 flex justify-between">
              <Button variant="ghost" onClick={()=>setTab("targets")}>戻る</Button>
              <Button onClick={()=>setTab("plan")}>次へ</Button>
            </div>
          </TabsContent>

          {/* 提案 */}
          <TabsContent value="plan" className="pt-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">提案サマリ</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground">許容幅</div>
                  <div className="font-medium">±{tol}%</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground">方式</div>
                  <div className="font-medium">{mode === "mid" ? "中間" : "目標"}</div>
                </div>
                <div className="border rounded-xl p-3">
                  <div className="text-muted-foreground">最小取引</div>
                  <div className="font-medium">{fmtJPY(minTrade)}</div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2">クラス</th>
                    <th className="p-2">指示</th>
                    <th className="p-2">差分(%)</th>
                    <th className="p-2">金額(概算)</th>
                    <th className="p-2">コメント</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.className}</td>
                      <td className="p-2 font-medium">{r.action}</td>
                      <td className="p-2">{r.diffPct.toFixed(2)}%</td>
                      <td className="p-2">{fmtJPY(r.amountJPY)}</td>
                      <td className="p-2 text-muted-foreground">{lockIlliquid && (r.className==="貴金属" ? "L3ロックのため対象外（例）" : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="outline" onClick={onExportCSV}><FileDown className="w-4 h-4 mr-1"/>CSV出力</Button>
              <Button><Download className="w-4 h-4 mr-1"/>この案を保存</Button>
            </div>

            <div className="mt-4">
              <Button variant="ghost" onClick={()=>setTab("rules")}>戻る</Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------
// 編集統一モーダル（AssetEditModal v2）
// ---------------------------------------------------------
export function AssetEditModalV2({ asset, onSave }) {
  const [open, setOpen] = useState(false);
  const [common, setCommon] = useState({ name: asset?.name || "", note: asset?.note || "", acquired_at: asset?.acquired_at || "", book_value_jpy: asset?.book_value_jpy || 0, valuation_source: asset?.valuation_source || "manual", liquidity_tier: asset?.liquidity_tier || "L2", tags: asset?.tags || "" });
  const [classFields, setClassFields] = useState(() => {
    switch (asset?.class) {
      case "us_stock": return { ticker: asset.ticker||"", exchange: asset.exchange||"", quantity: asset.quantity||0, avg_price_usd: asset.avg_price_usd||0 };
      case "jp_stock": return { code: asset.code||"", quantity: asset.quantity||0, avg_price_jpy: asset.avg_price_jpy||0 };
      case "precious_metal": return { metal: asset.metal||"gold", purity: asset.purity||0.9999, weight_g: asset.weight_g||0, unit_price_jpy: asset.unit_price_jpy||0 };
      case "cash": return { currency: asset.currency||"JPY", balance: asset.balance||0 };
      default: return {};
    }
  });
  const [recalc, setRecalc] = useState("auto"); // auto|scale|unit

  const save = async () => {
    // TODO: PATCH /api/assets/:id （共通＋クラス別を同時送信）
    onSave?.({ common, classFields, recalc });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Pencil className="w-4 h-4 mr-1"/>編集</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>資産を編集（統一）</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4 py-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">共通</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="名称" value={common.name} onChange={e=>setCommon({...common, name:e.target.value})} />
              <Input type="date" value={common.acquired_at} onChange={e=>setCommon({...common, acquired_at:e.target.value})} />
              <Input type="number" placeholder="簿価（円）" value={common.book_value_jpy} onChange={e=>setCommon({...common, book_value_jpy:Number(e.target.value)||0})} />
              <Textarea rows={3} placeholder="メモ" value={common.note} onChange={e=>setCommon({...common, note:e.target.value})} />
              <Input placeholder="タグ（JSON文字列）" value={common.tags} onChange={e=>setCommon({...common, tags:e.target.value})} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{asset?.class || "class"} の項目</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {asset?.class === "us_stock" && (
                <>
                  <Input placeholder="ティッカー" value={classFields.ticker} onChange={e=>setClassFields({...classFields, ticker:e.target.value})} />
                  <Input placeholder="取引所" value={classFields.exchange} onChange={e=>setClassFields({...classFields, exchange:e.target.value})} />
                  <Input type="number" placeholder="数量" value={classFields.quantity} onChange={e=>setClassFields({...classFields, quantity:Number(e.target.value)||0})} />
                  <Input type="number" placeholder="平均単価(USD)" value={classFields.avg_price_usd} onChange={e=>setClassFields({...classFields, avg_price_usd:Number(e.target.value)||0})} />
                </>
              )}
              {asset?.class === "jp_stock" && (
                <>
                  <Input placeholder="銘柄コード" value={classFields.code} onChange={e=>setClassFields({...classFields, code:e.target.value})} />
                  <Input type="number" placeholder="数量" value={classFields.quantity} onChange={e=>setClassFields({...classFields, quantity:Number(e.target.value)||0})} />
                  <Input type="number" placeholder="平均単価(円)" value={classFields.avg_price_jpy} onChange={e=>setClassFields({...classFields, avg_price_jpy:Number(e.target.value)||0})} />
                </>
              )}
              {asset?.class === "precious_metal" && (
                <>
                  <Input placeholder="金属（gold/silver等）" value={classFields.metal} onChange={e=>setClassFields({...classFields, metal:e.target.value})} />
                  <Input type="number" step="0.0001" placeholder="純度(0-1)" value={classFields.purity} onChange={e=>setClassFields({...classFields, purity:Number(e.target.value)||0})} />
                  <Input type="number" placeholder="重量(g)" value={classFields.weight_g} onChange={e=>setClassFields({...classFields, weight_g:Number(e.target.value)||0})} />
                  <Input type="number" placeholder="単価(円/g) 任意" value={classFields.unit_price_jpy} onChange={e=>setClassFields({...classFields, unit_price_jpy:Number(e.target.value)||0})} />
                </>
              )}
              {asset?.class === "cash" && (
                <>
                  <Input placeholder="通貨 (JPY/USD/CNY)" value={classFields.currency} onChange={e=>setClassFields({...classFields, currency:e.target.value})} />
                  <Input type="number" placeholder="残高" value={classFields.balance} onChange={e=>setClassFields({...classFields, balance:Number(e.target.value)||0})} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="border rounded-xl p-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">簿価の再計算</span>
            <div className="flex gap-2">
              {(["auto","scale","unit"]).map(k => (
                <Button key={k} size="sm" variant={recalc===k?"default":"outline"} onClick={()=>setRecalc(k)}>{k}</Button>
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">auto: クラス別既定 / scale: 按分 / unit: 単価×数量</div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={()=>setOpen(false)}>キャンセル</Button>
          <Button onClick={save}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------
// デモページ — まとめ（必要に応じて個別コンポーネントを使用）
// ---------------------------------------------------------
export default function PortfolioUIKitsDemo() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">UI Kits — Comparable Sales / Rebalance / Edit</h1>
        <div className="text-sm text-muted-foreground">雛形／API結線は TODO を参照</div>
      </div>

      <ComparableSalesWizard assetId="demo-asset-1" />

      <RebalanceWizard />

      <div className="border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">編集モーダル（統一）</h3>
          <AssetEditModalV2 asset={{ id: 1, class: "us_stock", name: "Apple Inc.", acquired_at: "2024-01-01", book_value_jpy: 123456, ticker: "AAPL", exchange: "NASDAQ", quantity: 10, avg_price_usd: 180 }} onSave={(p)=>console.log("save", p)} />
        </div>
        <p className="text-sm text-muted-foreground">行の末尾「編集」からこのモーダルを呼び出してください。</p>
      </div>
    </div>
  );
}
