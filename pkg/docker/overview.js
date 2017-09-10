/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2015 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

(function() {
    "use strict";

    var $ = require("jquery");
    var cockpit = require("cockpit");

    var React = require("react");
    var plot = require("plot");

    var util = require("./util");
    var storage = require("./storage.jsx");
    var view = require("./containers-view.jsx");
    var journal = require("journal");

    require("plot.css");

    var problems_client = cockpit.dbus('org.freedesktop.problems', { superuser: "try" });
    var service = problems_client.proxy('org.freedesktop.Problems2', '/org/freedesktop/Problems2');
    var problems = problems_client.proxies('org.freedesktop.Problems2.Entry', '/org/freedesktop/Problems2/Entry');

    var session;
    problems.wait(function() {
        service.GetSession().done(function(session_path) {
            session = problems_client.proxy('org.freedesktop.Problems2.Session', session_path);
            session.wait(function() {
                session.Authorize({}); //ignore return code
            });
        });
    });


    /* OVERVIEW PAGE
     */

    function init_overview (client) {
        var headerNode = document.querySelector('#containers .content-filter');
        var containerNode = document.getElementById('containers-containers');
        var imageNode = document.getElementById('containers-images');
        var displayable_problems = {};

        function update_container_list(onlyShowRunning, filterText) {
            React.render(React.createElement(view.ContainerList, {
                client: client,
                onlyShowRunning: onlyShowRunning,
                filterText: filterText,
                problems: displayable_problems
            }), containerNode);
        }

        function update_image_list(filterText) {
            React.render(React.createElement(view.ImageList, {
                client: client,
                filterText: filterText
            }), imageNode);
        }

        React.render(React.createElement(view.ContainerHeader, {
            onFilterChanged: function (filter, filterText) {
                update_container_list(filter === 'running', filterText);
                update_image_list(filterText);
            }
        }), headerNode);

        var find_problems = function () {
            var r = $.Deferred();
            problems.wait(function() {
                try {
                    service.GetProblems(0, {})
                        .done(function(problem_paths, options) {
                            for (var i in problem_paths) {
                                var p = problems[problem_paths[i]];
                                find_container_log(p);
                            }
                            r.resolve();
                        });
                }
                catch(err) {
                    r.resolve();
                }
            });
            return r;
        };

        function find_container_log (p) {
            if ( problems[p.path].Elements.indexOf('container_id') < 0 ) {
                return;
            }

            p.ReadElements(['container_id'], 0x4).done(function(data) {
                if (data.hasOwnProperty('container_id')){
                    problem_log(p, data['container_id'].v);
                }
            });
        }

        function problem_log (p, c_id) {
            var url = null;
            var message = "";
            var match = [ ];
            match.push('SYSLOG_IDENTIFIER=abrt-notification');
            match.push('PROBLEM_DIR=' + p.ID);
            journal.journalctl(match, { follow: false, reverse: true, all: true} ).
                stream(function(entries) {
                    // Only first entry is enough, since others are only previous occurrences
                    url = cockpit.location.encode(entries[0]['__CURSOR']);
                    url = "/system/logs#" + url;
                    if (entries[0]['PROBLEM_REASON'])
                        message = entries[0]['PROBLEM_REASON'];
                    else
                        message = entries[0]['MESSAGE'];

                    if ( c_id in displayable_problems )
                        displayable_problems[c_id].push([url, message]);
                    else
                        displayable_problems[c_id] = [[url, message]];
                }).
                fail(function (error) {
                    window.alert(error);
                });
        }

        find_problems().done(function() {
            update_container_list(true, '');
        });

        $(service).on("Crash", function(event, problem_path, uid) {
            var entry = problems_client.proxy('org.freedesktop.Problems2.Entry', problem_path);
            entry.wait(function() {
                find_container_log(entry);
                window.location.reload(); //TODO not ideal
            });
        });

        update_image_list('');

        var cpu_series;
        var mem_series;

        $(client).on('container.containers', function(event, id, container) {
            if (container && container.CGroup) {
                cpu_series.add_instance(container.CGroup);
                mem_series.add_instance(container.CGroup);
            }
        });

        var cpu_data = {
            internal: "cgroup.cpu.usage",
            units: "millisec",
            derive: "rate",
            factor: 0.1  // millisec / sec -> percent
        };

        var cpu_options = plot.plot_simple_template();
        $.extend(cpu_options.yaxis, { tickFormatter: function(v) { return v.toFixed(0); }
                                    });
        $.extend(cpu_options.grid,  { hoverable: true,
                                      autoHighlight: false
                                    });
        cpu_options.setup_hook = function (flot) {
            var axes = flot.getAxes();

            if (axes.yaxis.datamax)
                axes.yaxis.options.max = Math.ceil(axes.yaxis.datamax / 100) * 100;
            else
                axes.yaxis.options.max = 100;

            axes.yaxis.options.min = 0;
        };

        var cpu_plot = plot.plot($("#containers-cpu-graph"), 300);
        cpu_plot.set_options(cpu_options);
        cpu_series = cpu_plot.add_metrics_stacked_instances_series(cpu_data, { });
        $(cpu_series).on("value", function(ev, value) {
            $('#containers-cpu-text').text(util.format_cpu_usage(value));
        });
        cpu_plot.start_walking();

        var mem_data = {
            internal: "cgroup.memory.usage",
            units: "bytes"
        };

        var mem_options = plot.plot_simple_template();
        $.extend(mem_options.yaxis, { ticks: plot.memory_ticks,
                                      tickFormatter: plot.format_bytes_tick_no_unit
                                    });
        $.extend(mem_options.grid,  { hoverable: true,
                                      autoHighlight: false
                                    });
        mem_options.setup_hook = function (flot) {
            var axes = flot.getAxes();
            if (axes.yaxis.datamax < 1.5*1024*1024)
                axes.yaxis.options.max = 1.5*1024*1024;
            else
                axes.yaxis.options.max = null;
            axes.yaxis.options.min = 0;

            $("#containers-mem-unit").text(plot.bytes_tick_unit(axes.yaxis));
        };

        var mem_plot = plot.plot($("#containers-mem-graph"), 300);
        mem_plot.set_options(mem_options);
        mem_series = mem_plot.add_metrics_stacked_instances_series(mem_data, { });
        $(mem_series).on("value", function(ev, value) {
            $('#containers-mem-text').text(cockpit.format_bytes(value, 1024));
        });
        mem_plot.start_walking();

        $(window).on('resize', function () {
            cpu_plot.resize();
            mem_plot.resize();
        });

        React.render(React.createElement(storage.OverviewBox,
                                         { model: storage.get_storage_model(),
                                           small: true }),
                     $("#containers-storage-details")[0]);

        var commit = $('#container-commit-dialog')[0];
        $(commit).
            on("show.bs.modal", function(event) {
                var container = client.containers[event.relatedTarget.dataset.containerId];

                $(commit).find(".container-name").text(container.Name.replace(/^\//, ''));
                $(commit).attr('data-container-id', container.Id);

                var image = client.images[container.Config.Image];
                var repo = "";
                if (image && image.RepoTags)
                    repo = image.RepoTags[0].split(":", 1)[0];
                $(commit).find(".container-repository").attr('value', repo);

                $(commit).find(".container-tag").attr('value', "");

                cockpit.user().done(function (user) {
                    var author = user.full_name || user.name;
                    $(commit).find(".container-author").attr('value', author);
                });

                var command = "";
                if (container.Config)
                    command = util.quote_cmdline(container.Config.Cmd);
                if (!command)
                    command = container.Command;
                $(commit).find(".container-command").attr('value', command);
            }).
            find(".btn-primary").on("click", function() {
                var location = cockpit.location;
                var run = { "Cmd": util.unquote_cmdline($(commit).find(".container-command").val()) };
                var options = {
                    "author": $(commit).find(".container-author").val()
                };
                var tag = $(commit).find(".container-tag").val();
                if (tag)
                    options["tag"] = tag;
                var repository = $(commit).find(".container-repository").val();
                client.commit($(commit).attr('data-container-id'), repository, options, run).
                    fail(function(ex) {
                        util.show_unexpected_error(ex);
                    }).
                    done(function() {
                        location.go("/");
                    });
            });

        function hide() {
            $('#containers').hide();
        }

        function show() {
            $('#containers').show();
            cpu_plot.resize();
            mem_plot.resize();
        }

        return {
            show: show,
            hide: hide
        };
    }

    module.exports = {
        init: init_overview
    };
}());
