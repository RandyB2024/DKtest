"use client";

import {
  useMemo,
  useState,
} from "react";

type Bucket = {
  index: number;
  startDate: string;
  endDate: string;
  revenueCents: number;
  costsCents: number;
  resultCents: number;
};

type FinancialChartProps = {
  buckets: Bucket[];
};

type SeriesKey =
  | "revenue"
  | "costs"
  | "result";

const WIDTH = 1040;
const HEIGHT = 360;
const LEFT = 58;
const RIGHT = 20;
const TOP = 20;
const BOTTOM = 52;

const CHART_WIDTH =
  WIDTH - LEFT - RIGHT;

const CHART_HEIGHT =
  HEIGHT - TOP - BOTTOM;

const euro =
  new Intl.NumberFormat(
    "nl-NL",
    {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    },
  );

const shortDate =
  new Intl.DateTimeFormat(
    "nl-NL",
    {
      day: "2-digit",
      month: "short",
    },
  );

function formatMoney(
  cents: number,
) {
  return euro.format(
    cents / 100,
  );
}

function getDateLabel(
  value: string,
) {
  return shortDate.format(
    new Date(
      `${value}T12:00:00`,
    ),
  );
}

function getBarX(
  groupX: number,
  seriesIndex: number,
  barWidth: number,
  gap: number,
) {
  return (
    groupX +
    seriesIndex *
      (barWidth + gap)
  );
}

function getY(
  value: number,
  min: number,
  max: number,
) {
  const range =
    max - min || 1;

  return (
    TOP +
    CHART_HEIGHT -
    ((value - min) /
      range) *
      CHART_HEIGHT
  );
}

export default function FinancialChart({
  buckets,
}: FinancialChartProps) {
  const [
    hovered,
    setHovered,
  ] =
    useState<{
      bucketIndex: number;
      series: SeriesKey;
    } | null>(null);

  const model =
    useMemo(() => {
      const revenue =
        buckets.map(
          (bucket) =>
            bucket.revenueCents /
            100,
        );

      const costs =
        buckets.map(
          (bucket) =>
            bucket.costsCents /
            100,
        );

      const result =
        buckets.map(
          (bucket) =>
            bucket.resultCents /
            100,
        );

      const allValues = [
        ...revenue,
        ...costs,
        ...result,
        0,
      ];

      let min =
        Math.min(...allValues);
      let max =
        Math.max(...allValues);

      if (min === max) {
        min -= 1;
        max += 1;
      }

      const padding =
        (max - min) * 0.12;

      min -= padding;
      max += padding;

      const zeroY =
        getY(
          0,
          min,
          max,
        );

      return {
        revenue,
        costs,
        result,
        min,
        max,
        zeroY,
      };
    }, [buckets]);

  if (!buckets.length) {
    return null;
  }

  const groupWidth =
    CHART_WIDTH /
    Math.max(
      buckets.length,
      1,
    );

  const totalBarSpace =
    Math.min(
      54,
      Math.max(
        36,
        groupWidth * 0.7,
      ),
    );

  const gap = 6;
  const barWidth =
    Math.max(
      8,
      (totalBarSpace -
        gap * 2) /
        3,
    );

  const barsLeftOffset =
    (groupWidth -
      (barWidth * 3 +
        gap * 2)) /
    2;

  const yTicks =
    Array.from(
      { length: 5 },
      (_, index) => {
        const ratio =
          index / 4;

        const value =
          model.max -
          (model.max -
            model.min) *
            ratio;

        return {
          value,
          y:
            TOP +
            CHART_HEIGHT *
              ratio,
        };
      },
    );

  const seriesMeta: Array<{
    key: SeriesKey;
    label: string;
    color: string;
    values: number[];
  }> = [
    {
      key: "revenue",
      label: "Omzet",
      color: "#4f6ff7",
      values:
        model.revenue,
    },
    {
      key: "costs",
      label: "Kosten",
      color: "#e0ab62",
      values:
        model.costs,
    },
    {
      key: "result",
      label: "Resultaat",
      color: "#4fa778",
      values:
        model.result,
    },
  ];

  const hoveredBucket =
    hovered
      ? buckets[
          hovered.bucketIndex
        ]
      : null;

  return (
    <div
      style={{
        border:
          "1px solid #e3e9f1",
        borderRadius: 18,
        background:
          "linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)",
        padding:
          "18px 18px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <strong
            style={{
              display: "block",
              fontSize: 15,
              color: "#13253e",
            }}
          >
            Winst en verlies
          </strong>

          <span
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 12,
              color: "#71839a",
            }}
          >
            Omzet, kosten en resultaat
            per deelperiode
          </span>
        </div>

        {hoveredBucket && (
          <div
            style={{
              display: "grid",
              gap: 4,
              minWidth: 220,
              padding:
                "10px 12px",
              border:
                "1px solid #e7edf4",
              borderRadius: 12,
              background:
                "#f7f9fc",
            }}
          >
            <strong
              style={{
                fontSize: 13,
                color: "#12253d",
              }}
            >
              {getDateLabel(
                hoveredBucket.startDate,
              )}
            </strong>

            <span
              style={{
                fontSize: 12,
                color: "#4f6ff7",
              }}
            >
              Omzet:{" "}
              {formatMoney(
                hoveredBucket.revenueCents,
              )}
            </span>

            <span
              style={{
                fontSize: 12,
                color: "#b88236",
              }}
            >
              Kosten:{" "}
              {formatMoney(
                hoveredBucket.costsCents,
              )}
            </span>

            <span
              style={{
                fontSize: 12,
                color: "#2f8f63",
              }}
            >
              Resultaat:{" "}
              {formatMoney(
                hoveredBucket.resultCents,
              )}
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          overflowX: "auto",
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Financiële staafgrafiek"
          style={{
            width: "100%",
            minWidth: 640,
            height: "auto",
            display: "block",
          }}
        >
          {yTicks.map(
            (
              tick,
              index,
            ) => (
              <g
                key={index}
              >
                <line
                  x1={LEFT}
                  x2={
                    WIDTH -
                    RIGHT
                  }
                  y1={tick.y}
                  y2={tick.y}
                  stroke="#e8edf4"
                  strokeWidth="1"
                />

                <text
                  x={
                    LEFT - 10
                  }
                  y={
                    tick.y + 4
                  }
                  textAnchor="end"
                  fontSize="11"
                  fill="#91a0b1"
                >
                  {euro.format(
                    tick.value,
                  )}
                </text>
              </g>
            ),
          )}

          <line
            x1={LEFT}
            x2={
              WIDTH - RIGHT
            }
            y1={model.zeroY}
            y2={model.zeroY}
            stroke="#cfd8e5"
            strokeWidth="1.25"
          />

          {buckets.map(
            (
              bucket,
              bucketIndex,
            ) => {
              const centerX =
                LEFT +
                groupWidth *
                  bucketIndex;

              const groupX =
                centerX +
                barsLeftOffset;

              return (
                <g
                  key={
                    bucket.index
                  }
                >
                  {seriesMeta.map(
                    (
                      series,
                      seriesIndex,
                    ) => {
                      const value =
                        series.values[
                          bucketIndex
                        ];

                      const x =
                        getBarX(
                          groupX,
                          seriesIndex,
                          barWidth,
                          gap,
                        );

                      const y =
                        getY(
                          value,
                          model.min,
                          model.max,
                        );

                      const height =
                        Math.max(
                          3,
                          Math.abs(
                            model.zeroY -
                              y,
                          ),
                        );

                      const rectY =
                        value >= 0
                          ? y
                          : model.zeroY;

                      const isHovered =
                        hovered
                          ?.bucketIndex ===
                          bucketIndex &&
                        hovered
                          ?.series ===
                          series.key;

                      return (
                        <g
                          key={
                            series.key
                          }
                          onMouseEnter={() =>
                            setHovered(
                              {
                                bucketIndex,
                                series:
                                  series.key,
                              },
                            )
                          }
                          onMouseLeave={() =>
                            setHovered(
                              null,
                            )
                          }
                          style={{
                            cursor:
                              "default",
                          }}
                        >
                          <rect
                            x={x}
                            y={rectY}
                            rx="6"
                            ry="6"
                            width={
                              barWidth
                            }
                            height={
                              height
                            }
                            fill={
                              series.color
                            }
                            opacity={
                              isHovered
                                ? 1
                                : 0.92
                            }
                          />

                          {isHovered && (
                            <rect
                              x={
                                x - 2
                              }
                              y={
                                rectY - 2
                              }
                              rx="8"
                              ry="8"
                              width={
                                barWidth +
                                4
                              }
                              height={
                                height +
                                4
                              }
                              fill="none"
                              stroke={
                                series.color
                              }
                              strokeWidth="2"
                            />
                          )}
                        </g>
                      );
                    },
                  )}

                  <text
                    x={
                      centerX +
                      groupWidth / 2
                    }
                    y={
                      HEIGHT - 14
                    }
                    textAnchor="middle"
                    fontSize="11"
                    fill="#75869c"
                  >
                    {getDateLabel(
                      bucket.startDate,
                    )}
                  </text>
                </g>
              );
            },
          )}
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 8,
          paddingLeft: 4,
        }}
      >
        {seriesMeta.map(
          (item) => (
            <span
              key={item.key}
              style={{
                display: "inline-flex",
                alignItems:
                  "center",
                gap: 8,
                fontSize: 12,
                color: "#687b91",
              }}
            >
              <i
                style={{
                  width: 10,
                  height: 10,
                  borderRadius:
                    999,
                  display:
                    "inline-block",
                  background:
                    item.color,
                }}
              />
              {item.label}
            </span>
          ),
        )}

        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "#98a5b5",
          }}
        >
          Beweeg over de staven voor details
        </span>
      </div>
    </div>
  );
}