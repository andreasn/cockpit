import 'jquery';

import '@patternfly/patternfly/patternfly-charts.css';
import '../lib/patternfly/patternfly-cockpit.scss';
import './plot-pf4.css';

import React, { useState, useRef } from 'react';
import ReactDOM from "react-dom";

import {
    Button,
    Dropdown,
    DropdownToggle,
    DropdownItem,
    DropdownSeparator,
    Page,
    Card,
    CardBody,
    Split,
    SplitItem,
    Grid,
    GridItem
} from '@patternfly/react-core';

import * as plot from "plot.js";
import { useObject, useEvent } from "hooks.js";

import cockpit from "cockpit";
import moment from "moment";

import "../lib/patternfly/patternfly-4-overrides.scss";

const _ = cockpit.gettext;

moment.locale(cockpit.language);

function time_ticks(data) {
    const first_plot = data[0].data;
    const start_ms = first_plot[0][0];
    const end_ms = first_plot[first_plot.length - 1][0];

    // Determine size between ticks

    const sizes_in_seconds = [
        60, // minute
        5 * 60, // 5 minutes
        10 * 60, // 10 minutes
        30 * 60, // half hour
        60 * 60, // hour
        6 * 60 * 60, // quarter day
        12 * 60 * 60, // half day
        24 * 60 * 60, // day
        7 * 24 * 60 * 60, // week
        30 * 24 * 60 * 60, // month
        183 * 24 * 60 * 60, // half a year
        365 * 24 * 60 * 60, // year
        10 * 365 * 24 * 60 * 60 // 10 years
    ];

    let size;
    for (let i = 0; i < sizes_in_seconds.length; i++) {
        if (((end_ms - start_ms) / 1000) / sizes_in_seconds[i] < 10 || i == sizes_in_seconds.length - 1) {
            size = sizes_in_seconds[i] * 1000;
            break;
        }
    }

    // Determine what to omit from the tick label.  If it's all in the
    // current year, we don't need to include the year, for example.

    var n = new Date();
    var l = new Date(start_ms);

    const year_index = 0;
    const month_index = 1;
    const day_index = 2;
    const hour_minute_index = 3;

    let format_begin;
    const format_end = hour_minute_index;

    format_begin = year_index;
    if (l.getFullYear() == n.getFullYear()) {
        format_begin = month_index;
        if (l.getMonth() == n.getMonth()) {
            format_begin = day_index;
            if (l.getDate() == n.getDate())
                format_begin = hour_minute_index;
        }
    }

    if (format_begin == day_index)
        format_begin = month_index;

    // Compute the actual ticks

    const ticks = [];
    let t = Math.ceil(start_ms / size) * size;
    while (t < end_ms) {
        ticks.push(t);
        t += size;
    }

    // Render the label

    function pad(n) {
        var str = n.toFixed();
        if (str.length == 1)
            str = '0' + str;
        return str;
    }

    function format_tick(val, index, ticks) {
        var d = new Date(val);
        var label = ' ';

        if (year_index >= format_begin && year_index <= format_end)
            label += d.getFullYear().toFixed() + ' ';
        if (month_index >= format_begin && month_index <= format_end)
            label += moment(d).format('MMM') + ' ';
        if (day_index >= format_begin && day_index <= format_end)
            label += d.getDate().toFixed() + '\n';
        if (hour_minute_index >= format_begin && hour_minute_index <= format_end)
            label += pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ';

        return label.substr(0, label.length - 1);
    }

    return {
        ticks: ticks,
        formatter: format_tick,
        start: start_ms,
        end: end_ms
    };
}

function value_ticks(data) {
    let max = 4 * 1024;
    const last_plot = data[data.length - 1].data;
    for (let i = 0; i < last_plot.length; i++) {
        const s = last_plot[i][1] || last_plot[i][2];
        if (s > max)
            max = s;
    }

    // Pick a unit
    let unit = 1;
    while (max > unit * 1024)
        unit *= 1024;

    // Find the highest power of 10 that is below max.  If we use that
    // as the distance between ticks, we get at most 10 ticks.
    var size = Math.pow(10, Math.floor(Math.log10(max / unit))) * unit;

    // Get the number of ticks to be around 4, but don't produce
    // fractional numbers.
    while (max / size > 7)
        size *= 2;
    while (max / size < 3 && size / unit >= 10)
        size /= 2;

    var ticks = [];
    for (let t = 0; t <= max; t += size)
        ticks.push(t);

    const unit_str = cockpit.format_bytes_per_sec(unit, 1024, true)[1];

    return {
        ticks: ticks,
        formatter: (val) => cockpit.format_bytes_per_sec(val, unit_str, true)[0],
        unit: unit_str,
        max: max
    };
}

class ZoomState {
    constructor(plots) {
        cockpit.event_target(this);
        this.x_range = 5 * 60;
        this.x_stop = undefined;
        this.history = [];
        this.plots = plots;

        this.enable_zoom = false;

        this.enable_zoom_in = false;
        this.enable_zoom_out = true;
        this.enable_scroll_left = true;
        this.enable_scroll_right = false;

        this._update = () => {
            const enable = !!this.plots.find(p => p.archives);
            if (enable != this.enable_zoom) {
                this.enable_zoom = enable;
                this.dispatchEvent("changed");
            }
        };

        this.plots.forEach(p => p.addEventListener("changed", this._update));
    }

    destroy() {
        this.plots.forEach(p => p.removeEventListener("changed", this._update));
    }

    reset() {
        const plot_min_x_range = 5 * 60;

        if (this.x_range < plot_min_x_range) {
            this.x_stop += (plot_min_x_range - this.x_range) / 2;
            this.x_range = plot_min_x_range;
        }
        if (this.x_stop >= (new Date()).getTime() / 1000 - 10)
            this.x_stop = undefined;

        this.plots.forEach(p => {
            p.stop_walking();
            p.reset(this.x_range, this.x_stop);
            p.refresh();
            if (this.x_stop === undefined)
                p.start_walking();
        });

        this.enable_zoom_in = (this.x_range > plot_min_x_range);
        this.enable_scroll_right = (this.x_stop !== undefined);

        this.dispatchEvent("changed");
    }

    set_range(x_range) {
        this.history = [];
        this.x_range = x_range;
        this.reset();
    }

    zoom_in(x_range, x_stop) {
        this.history.push(this.x_range);
        this.x_range = x_range;
        this.x_stop = x_stop;
        this.reset();
    }

    zoom_out() {
        const plot_zoom_steps = [
            5 * 60,
            60 * 60,
            6 * 60 * 60,
            24 * 60 * 60,
            7 * 24 * 60 * 60,
            30 * 24 * 60 * 60,
            365 * 24 * 60 * 60
        ];

        var r = this.history.pop();
        if (r === undefined) {
            var i;
            for (i = 0; i < plot_zoom_steps.length - 1; i++) {
                if (plot_zoom_steps[i] > this.x_range)
                    break;
            }
            r = plot_zoom_steps[i];
        }
        if (this.x_stop !== undefined)
            this.x_stop += (r - this.x_range) / 2;
        this.x_range = r;
        this.reset();
    }

    goto_now() {
        this.x_stop = undefined;
        this.reset();
    }

    scroll_left() {
        var step = this.x_range / 10;
        if (this.x_stop === undefined)
            this.x_stop = (new Date()).getTime() / 1000;
        this.x_stop -= step;
        this.reset();
    }

    scroll_right() {
        var step = this.x_range / 10;
        if (this.x_stop !== undefined) {
            this.x_stop += step;
            this.reset();
        }
    }
}

const ZoomControls = ({ zoom_state }) => {
    function format_range(seconds) {
        var n;
        if (seconds >= 365 * 24 * 60 * 60) {
            n = Math.ceil(seconds / (365 * 24 * 60 * 60));
            return cockpit.format(cockpit.ngettext("$0 year", "$0 years", n), n);
        } else if (seconds >= 30 * 24 * 60 * 60) {
            n = Math.ceil(seconds / (30 * 24 * 60 * 60));
            return cockpit.format(cockpit.ngettext("$0 month", "$0 months", n), n);
        } else if (seconds >= 7 * 24 * 60 * 60) {
            n = Math.ceil(seconds / (7 * 24 * 60 * 60));
            return cockpit.format(cockpit.ngettext("$0 week", "$0 weeks", n), n);
        } else if (seconds >= 24 * 60 * 60) {
            n = Math.ceil(seconds / (24 * 60 * 60));
            return cockpit.format(cockpit.ngettext("$0 day", "$0 days", n), n);
        } else if (seconds >= 60 * 60) {
            n = Math.ceil(seconds / (60 * 60));
            return cockpit.format(cockpit.ngettext("$0 hour", "$0 hours", n), n);
        } else {
            n = Math.ceil(seconds / 60);
            return cockpit.format(cockpit.ngettext("$0 minute", "$0 minutes", n), n);
        }
    }

    const [isOpen, setIsOpen] = useState(false);
    useEvent(zoom_state, "changed");

    function range_item(seconds, title) {
        return (
            <DropdownItem key={title}
                          onClick={() => {
                              setIsOpen(false);
                              zoom_state.set_range(seconds);
                          }}>
                {title}
            </DropdownItem>);
    }

    if (!zoom_state.enable_zoom)
        return null;

    return (
        <div>
            <Dropdown
                isOpen={isOpen}
                toggle={<DropdownToggle onToggle={setIsOpen}>{format_range(zoom_state.x_range)}</DropdownToggle>}
                dropdownItems={[
                    <DropdownItem key="now" onClick={() => { zoom_state.goto_now(); setIsOpen(false) }}>
                        {_("Go to now")}
                    </DropdownItem>,
                    <DropdownSeparator key="sep" />,
                    range_item(5 * 60, _("5 minutes")),
                    range_item(60 * 60, _("1 hour")),
                    range_item(6 * 60 * 60, _("6 hours")),
                    range_item(24 * 60 * 60, _("1 day")),
                    range_item(7 * 24 * 60 * 60, _("1 week"))
                ]} />
            { "\n" }
            <Button variant="secondary" onClick={() => zoom_state.zoom_out()}
                    isDisabled={!zoom_state.enable_zoom_out}>
                <span className="glyphicon glyphicon-zoom-out" />
            </Button>
            { "\n" }
            <Button variant="secondary" onClick={() => zoom_state.scroll_left()}
                    isDisabled={!zoom_state.enable_scroll_left}>
                <span className="fa fa-angle-left" />
            </Button>
            <Button variant="secondary" onClick={() => zoom_state.scroll_right()}
                    isDisabled={!zoom_state.enable_scroll_right}>
                <span className="fa fa-angle-right" />
            </Button>
        </div>
    );
};

const StorageSvgPlot = ({ title, plot, zoom_state, onHover }) => {
    const container_ref = useRef(null);
    const measure_ref = useRef(null);

    useEvent(plot, "plot");
    useEvent(zoom_state, "changed");
    useEvent(window, "resize");

    const [selection, setSelection] = useState(null);

    const chart_data = plot.flot_data;
    const t_ticks = time_ticks(chart_data);
    const y_ticks = value_ticks(chart_data);

    function make_chart() {
        if (!container_ref.current)
            return null;

        const w = container_ref.current.offsetWidth;
        const h = container_ref.current.offsetHeight;

        const x_off = t_ticks.start;
        const x_range = (t_ticks.end - t_ticks.start);
        const y_range = y_ticks.max;

        const tick_length = 5;
        const tick_gap = 3;

        const rect = (measure_ref.current
            ? measure_ref.current.getBoundingClientRect()
            : { width: 36, height: 20 });

        const m_left = Math.ceil(rect.width) + tick_gap + tick_length; // unit string plus gap plus tick
        const m_right = 30; // half of the time label
        const m_top = 1.5 * Math.ceil(rect.height); // one and a half line
        const m_bottom = tick_length + tick_gap + 2 * Math.ceil(rect.height); // two line labels plus gap plus tick

        function x_coord(x) {
            return (x - x_off) / x_range * (w - m_left - m_right) + m_left;
        }

        function x_value(c) {
            return (c - m_left) / (w - m_left - m_right) * x_range + x_off;
        }

        function y_coord(y) {
            return h - y / y_range * (h - m_top - m_bottom) - m_bottom;
        }

        function cmd(op, x, y) {
            return op + x.toFixed() + "," + y.toFixed() + " ";
        }

        function path(data, color, index) {
            let d = cmd("M", m_left, h - m_bottom);
            for (let i = 0; i < data.length; i++) {
                d += cmd("L", x_coord(data[i][0]), y_coord(data[i][1]));
            }
            d += cmd("L", w - m_right, h - m_bottom);
            d += "z";

            return <path key={index} d={d} stroke="black" fill={color}
                         onMouseEnter={() => onHover(index)}
                         onMouseLeave={() => onHover(-1)} />;
        }

        const colors = [
            '#39a5dc',
            '#008ff0',
            '#2daaff',
            '#69c2ff',
            '#a5daff',
            '#e1f3ff',
            '#00243c',
            '#004778'
        ];

        const paths = [];
        for (let i = chart_data.length - 1; i >= 0; i--)
            paths.push(path(chart_data[i].data, colors[i], i));

        function start_dragging(event) {
            if (event.button !== 0)
                return;

            const bounds = container_ref.current.getBoundingClientRect();
            const x = event.clientX - bounds.x;
            if (x >= m_left && x < w - m_right)
                setSelection({ start: x, stop: x, left: x, right: x });
        }

        function drag(event) {
            const bounds = container_ref.current.getBoundingClientRect();
            let x = event.clientX - bounds.x;
            if (x < m_left) x = m_left;
            if (x > w - m_right) x = w - m_right;
            setSelection({
                start: selection.start, stop: x,
                left: Math.min(selection.start, x), right: Math.max(selection.start, x)
            });
        }

        function stop_dragging() {
            const left = x_value(selection.left) / 1000;
            const right = x_value(selection.right) / 1000;
            zoom_state.zoom_in(right - left, right);
            setSelection(null);
        }

        function cancel_dragging() {
            setSelection(null);
        }

        return (
            <svg width={w} height={h}
                 onMouseDown={zoom_state.enable_zoom_in ? start_dragging : null}
                 onMouseUp={selection ? stop_dragging : null}
                 onMouseMove={selection ? drag : null}
                 onMouseLeave={cancel_dragging}>
                <text x={0} y={-20} style={{ fontSize: "small" }} ref={measure_ref}>MiB/s</text>
                <rect x={m_left} y={m_top} width={w - m_left - m_right} height={h - m_top - m_bottom}
                      stroke="black" fill="transparent" shapeRendering="crispEdges" />
                <text x={m_left - tick_length - tick_gap} y={0.5 * m_top}
                      style={{ fontSize: "small" }}
                      textAnchor="end">
                    {y_ticks.unit}
                </text>
                <text x={m_left} y={0.5 * m_top}>
                    {title}
                </text>
                { y_ticks.ticks.map((t, i) => <line key={i}
                                                    x1={m_left - tick_length} x2={w - m_right}
                                                    y1={y_coord(t)} y2={y_coord(t)}
                                                    stroke="black" shapeRendering="crispEdges" />) }
                { t_ticks.ticks.map((t, i) => <line key={i}
                                                    x1={x_coord(t)} x2={x_coord(t)}
                                                    y1={h - m_bottom} y2={h - m_bottom + tick_length}
                                                    stroke="black" shapeRendering="crispEdges" />) }
                { paths }
                { y_ticks.ticks.map((t, i) => <text key={i} x={m_left - tick_length - tick_gap} y={y_coord(t) + 5}
                                                    textAnchor="end"
                                                    style={{ fontSize: "small" }}>
                    {y_ticks.formatter(t)}
                </text>) }
                { t_ticks.ticks.map((t, i) => <text key={i} y={h - m_bottom + tick_length + tick_gap}
                                                    textAnchor="middle"
                                                    style={{ fontSize: "small" }}>
                    { t_ticks.formatter(t).split("\n")
                            .map((s, j) =>
                                <tspan key={i + "." + j} x={x_coord(t)} dy="1.2em">{s}</tspan>) }
                </text>) }
                { selection &&
                <rect x={selection.left} y={m_top} width={selection.right - selection.left} height={h - m_top - m_bottom}
                        stroke="black" fill="tan" opacity="0.5" shapeRendering="crispEdges" /> }
            </svg>);
    }

    return (
        <div className="storage-graph" ref={container_ref}>
            {make_chart()}
        </div>);
};

class PlotState {
    constructor() {
        this.plot = new plot.Plot(null, 300);
        this.plot.start_walking();
    }

    plot_single(metric) {
        if (this.stacked_instances_series) {
            this.stacked_instances_series.clear_instances();
            this.stacked_instances_series.remove();
            this.stacked_instances_series = null;
        }
        if (!this.sum_series) {
            this.sum_series = this.plot.add_metrics_sum_series(metric, { });
        }
    }

    plot_instances(metric, insts) {
        if (this.sum_series) {
            this.sum_series.remove();
            this.sum_series = null;
        }
        if (!this.stacked_instances_series) {
            this.stacked_instances_series = this.plot.add_metrics_stacked_instances_series(metric, { });
        }
        // XXX - Add all instances, but don't remove anything.
        //
        // This doesn't remove old instances, but that is mostly
        // harmless since if the block device doesn't exist anymore, we
        // don't get samples for it.  But it would be better to be precise here.
        for (var i = 0; i < insts.length; i++) {
            this.stacked_instances_series.add_instance(insts[i]);
        }
    }

    destroy() {
        this.plot.destroy();
    }
}

const instances_read_metric = {
    direct: "disk.dev.read_bytes",
    internal: "block.device.read",
    units: "bytes",
    derive: "rate",
    threshold: 1000
};

const instances_write_metric = {
    direct: "disk.dev.write_bytes",
    internal: "block.device.written",
    units: "bytes",
    derive: "rate",
    threshold: 1000
};

const single_read_metric = {
    direct: ["disk.all.read_bytes"],
    internal: ["disk.all.read"],
    units: "bytes",
    derive: "rate",
    threshold: 1000
};

const single_write_metric = {
    direct: ["disk.all.write_bytes"],
    internal: ["disk.all.written"],
    units: "bytes",
    derive: "rate",
    threshold: 1000
};

const StoragePlots = () => {
    const devs = ["vda", "sda", "sdb"];

    const ps1 = useObject(() => new PlotState(), ps => ps.destroy(), []);
    const ps2 = useObject(() => new PlotState(), ps => ps.destroy(), []);
    const zs = useObject(() => new ZoomState([ps1.plot, ps2.plot]), zs => zs.destroy(), [ps1.plot, ps2.plot]);

    if (devs.length > 8) {
        ps1.plot_single(single_read_metric);
        ps2.plot_single(single_write_metric);
    } else {
        ps1.plot_instances(instances_read_metric, devs);
        ps2.plot_instances(instances_write_metric, devs);
    }

    const [hovered, setHovered] = useState(null);

    return (
        <>
            <Split>
                <SplitItem isFilled />
                <SplitItem><ZoomControls zoom_state={zs} /></SplitItem>
            </Split>
            <Grid sm={12} md={6} lg={6} hasGutter>
                <GridItem>
                    <StorageSvgPlot title="Reading" plot={ps1.plot} zoom_state={zs}
                                    onHover={idx => setHovered(devs[idx])} />
                </GridItem>
                <GridItem>
                    <StorageSvgPlot title="Writing" plot={ps2.plot} zoom_state={zs}
                                    onHover={idx => setHovered(devs[idx])} />
                </GridItem>
            </Grid>
            <div>{(hovered && devs.length <= 8) ? hovered : "--"}</div>
        </>);
};

const MyPage = () => {
    return (
        <Page>
            <Card>
                <CardBody>
                    <StoragePlots />
                </CardBody>
            </Card>
        </Page>);
};

document.addEventListener("DOMContentLoaded", function() {
    ReactDOM.render(<MyPage />, document.getElementById('plots'));
});
