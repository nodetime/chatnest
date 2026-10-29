"use client";

import { ArrowUpRight, FileText, Globe, MapPin } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/app/_components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/ui/sheet";

const examples = [
  {
    id: "commute",
    name: "轻量通勤旅行包",
    price: "129.00",
    region: "浙江 · 杭州",
    seller: "清禾箱包",
    sources: 3,
    subtitle: "轻量款 · 多口袋收纳",
    tone: "#68756b",
  },
  {
    id: "canvas",
    name: "帆布短途旅行袋",
    price: "89.00",
    region: "广东 · 广州",
    seller: "原野生活",
    sources: 2,
    subtitle: "帆布款 · 可手提肩背",
    tone: "#9d8b76",
  },
  {
    id: "fold",
    name: "折叠轻便行李包",
    price: "69.00",
    region: "河北 · 保定",
    seller: "远行用品",
    sources: 3,
    subtitle: "折叠款 · 轻便易收纳",
    tone: "#647281",
  },
  {
    id: "weekend",
    name: "周末双肩旅行包",
    price: "159.00",
    region: "福建 · 泉州",
    seller: "山川箱包",
    sources: 2,
    subtitle: "双肩款 · 日常与短途出行",
    tone: "#626266",
  },
];

function BagThumbnail({
  tone,
  large = false,
}: {
  tone: string;
  large?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={
        large
          ? "landing-product-image landing-product-image--large"
          : "landing-product-image"
      }
      fill="none"
      viewBox="0 0 56 56"
    >
      <rect fill="#f1f0ed" height="56" rx="9" width="56" />
      <ellipse cx="28" cy="43" fill="#d7d5cf" rx="19" ry="3" />
      <path d="M21 24v-7c0-7 14-7 14 0v7" stroke={tone} strokeWidth="2.4" />
      <path
        d="M11 25a6 6 0 0 1 6-6h22a6 6 0 0 1 6 6l2 14a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4l2-14Z"
        fill={tone}
      />
      <path
        d="m17 21-1 20M39 21l1 20"
        opacity=".5"
        stroke="#fff"
        strokeWidth="1.5"
      />
      <path d="M12 27h32M24 31h8" opacity=".35" stroke="#fff" />
      <path
        d="M10 27v11M46 27v11"
        stroke="#000"
        strokeOpacity=".12"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Marketing examples are separate from all real tasks, providers and artifacts. */
export function LandingPreview() {
  const [selected, setSelected] = useState<(typeof examples)[number] | null>(
    null
  );
  const open = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setSelected(
      examples.find(
        (item) => item.id === event.currentTarget.dataset.example
      ) ?? null
    );
  }, []);
  const changeOpen = useCallback((value: boolean) => {
    if (!value) {
      setSelected(null);
    }
  }, []);
  return (
    <section
      aria-label="结果示例，不代表实际查询结果"
      className="landing-preview"
      id="product"
    >
      <div className="landing-preview__caption">
        <span>商品线索对照</span>
        <span>结果示例</span>
      </div>
      <div className="landing-preview__scroll">
        <table>
          <thead>
            <tr>
              <th>候选商品</th>
              <th>价格</th>
              <th>商家</th>
              <th>地区</th>
              <th>相关资料</th>
              <th>
                <span className="sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {examples.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="landing-product">
                    <BagThumbnail tone={item.tone} />
                    <div>
                      <span>{item.name}</span>
                      <small>{item.subtitle}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="landing-price">
                    <small>¥</small>
                    {item.price}
                  </span>
                </td>
                <td>{item.seller}</td>
                <td>
                  <span className="landing-region">{item.region}</span>
                </td>
                <td>
                  <span className="landing-source-count">
                    <FileText aria-hidden="true" size={13} />
                    {item.sources} 条资料
                  </span>
                </td>
                <td>
                  <Button
                    aria-label={`预览结果：${item.name}`}
                    className="landing-preview-action"
                    data-example={item.id}
                    onClick={open}
                    size="sm"
                    variant="outline"
                  >
                    预览
                    <ArrowUpRight aria-hidden="true" size={12} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet onOpenChange={changeOpen} open={selected !== null}>
        <SheetContent className="landing-menu landing-detail">
          <SheetHeader>
            <SheetTitle>结果示例</SheetTitle>
            <SheetDescription>
              以下为展示示例，不代表实际商品或查询结果。
            </SheetDescription>
          </SheetHeader>
          {!!selected && (
            <div className="landing-detail__body">
              <BagThumbnail large tone={selected.tone} />
              <h3>{selected.name}</h3>
              <p>{selected.subtitle}</p>
              <div className="landing-detail__price">¥ {selected.price}</div>
              <dl>
                <div>
                  <dt>商家示例</dt>
                  <dd>{selected.seller}</dd>
                </div>
                <div>
                  <dt>
                    <MapPin aria-hidden="true" size={14} />
                    地区
                  </dt>
                  <dd>{selected.region}</dd>
                </div>
                <div>
                  <dt>
                    <Globe aria-hidden="true" size={14} />
                    资料示例
                  </dt>
                  <dd>产品页面、商家资料与规格说明</dd>
                </div>
              </dl>
              <p className="landing-detail__note">
                实际任务会保留工具返回的原始字段与来源；信息是否准确、是否符合目标，需要进一步核对。
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
