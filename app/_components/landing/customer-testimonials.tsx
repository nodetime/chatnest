"use client";

import { useEffect, useRef, useState } from "react";

interface CustomerReview {
  avatar: string;
  name: string;
  role: string;
  text: string;
}

// 仅用于首页展示的虚构评价，不接入真实客户或任务数据。
const reviews: readonly CustomerReview[] = [
  {
    avatar: "律",
    name: "某某律师",
    role: "知识产权律师",
    text: "前期最花时间的是从大量商品里找相似线索。现在可以先整理出候选商品、来源链接和对比信息，我们再集中做专业核验，案件准备更有条理。",
  },
  {
    avatar: "所",
    name: "某某主任",
    role: "某知识产权律所",
    text: "团队接到材料后，往往需要多人反复检索和整理。把初步线索按统一结构汇总后，讨论案件时更容易对齐信息，也方便分配后续核查工作。",
  },
  {
    avatar: "法",
    name: "某科技公司",
    role: "法务部",
    text: "我们更关心每条线索从哪里来、为什么值得关注。相似点、差异和原始链接放在一起，内部沟通和后续复核都方便了很多。",
  },
  {
    avatar: "知",
    name: "某品牌公司",
    role: "知识产权部",
    text: "面对多个平台上的疑似侵权商品，先把分散的图片、店铺和链接整理起来，再逐项判断是否跟进，日常线索排查有了清晰的工作入口。",
  },
  {
    avatar: "诉",
    name: "某某律师",
    role: "诉讼业务团队",
    text: "图片、网页和客户提供的文件经常混在一起。先按问题梳理材料、保留出处，后面写分析意见和补充证据时，就不必反复翻找。",
  },
  {
    avatar: "企",
    name: "某制造企业",
    role: "法务负责人",
    text: "业务同事提供的信息通常比较零散。现在可以围绕同一个目标汇总资料，再把需要律师核实的问题列出来，交接时更容易说清楚。",
  },
];

const INITIAL_GROUP_COUNT = 3;

function CustomerReviewCard({ review }: { review: CustomerReview }) {
  return (
    <li className="landing-review">
      <div className="landing-review__content">
        <svg
          aria-hidden="true"
          className="landing-review__quote"
          viewBox="0 0 24 24"
        >
          <path d="M10 5H7C3.5 5 2 8 2 12v6h8v-8H6c.2-2 1.4-3 4-3V5Zm12 0h-3c-3.5 0-5 3-5 7v6h8v-8h-4c.2-2 1.4-3 4-3V5Z" />
        </svg>
        <blockquote>{review.text}</blockquote>
      </div>
      <div aria-hidden="true" className="landing-review__divider" />
      <div className="landing-review__person">
        <span aria-hidden="true" className="landing-review__avatar">
          {review.avatar}
        </span>
        <div className="landing-review__label">
          <p className="landing-review__name">{review.name}</p>
          <p className="landing-review__role">{review.role}</p>
        </div>
      </div>
    </li>
  );
}

export function CustomerTestimonials() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const beltRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLUListElement>(null);
  const [groupCount, setGroupCount] = useState(INITIAL_GROUP_COUNT);

  useEffect(() => {
    const viewport = viewportRef.current;
    const belt = beltRef.current;
    const group = groupRef.current;
    if (!(viewport && belt && group)) {
      return;
    }

    const coverViewport = () => {
      const gap = Number.parseFloat(getComputedStyle(belt).columnGap);
      const cycle = group.getBoundingClientRect().width + gap;
      if (cycle <= 0) {
        return;
      }
      belt.style.setProperty("--testimonials-cycle", `${cycle}px`);
      // 多留一组覆盖左侧裁切和循环末尾，宽屏也不会露空白。
      setGroupCount(Math.ceil(viewport.clientWidth / cycle) + 2);
    };

    coverViewport();
    const observer = new ResizeObserver(coverViewport);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: `review-group-${index}`,
    isCopy: index > 0,
  }));

  return (
    <section
      aria-labelledby="landing-testimonials-heading"
      className="landing-testimonials"
      id="testimonials"
    >
      <h2 id="landing-testimonials-heading">我们的客户怎么说</h2>
      <div className="landing-testimonials__window" ref={viewportRef}>
        <div className="landing-testimonials__belt" ref={beltRef}>
          {groups.map(({ id, isCopy }) => (
            <ul
              aria-hidden={isCopy || undefined}
              aria-label={isCopy ? undefined : "客户评价"}
              className={`landing-testimonials__group${isCopy ? " landing-testimonials__copy" : ""}`}
              key={id}
              ref={isCopy ? undefined : groupRef}
              role={isCopy ? undefined : "list"}
            >
              {reviews.map((review) => (
                <CustomerReviewCard key={review.role} review={review} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
