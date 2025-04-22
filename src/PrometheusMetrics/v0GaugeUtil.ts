import type { Gauge } from "prom-client";

// The idea to set zero value to the gauge and then set the value to the number of items in the list

type Labels = Record<string, string> | {}

const gaugeListMemo = new WeakMap<Gauge, Map<string, Labels>>();

export const collectGaugeData = <T>(
    gauge: Gauge,
    labelNames: string[],
    list: T[],
    labelExtractor: (item: T) => Labels
) => {
    let labelsMemo = gaugeListMemo.get(gauge);
    if (!labelsMemo) {
        labelsMemo = new Map<string, Labels>();
        gaugeListMemo.set(gauge, labelsMemo);
    }

    for (const label of labelsMemo.values()) {
        gauge.set(label, 0);
    }

    for (const item of list) {
        const labels = labelExtractor(item);
        const labelKey = labelNames.map(name => labels[name]).join('|');
        labelsMemo.set(labelKey, labels);
        gauge.inc(labels, 1);
    };
};
