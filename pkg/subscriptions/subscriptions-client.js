/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
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

define([
    "jquery",
    "base1/cockpit",
], function($, cockpit) {

"use strict";

var _ = cockpit.gettext;

var client = { };

client.subscriptionStatus = {
    serviceStatus: undefined,
    status: undefined,
    products: [],
    error: undefined,
};

// callback that is used to notify when data has changed
var updateCallback;

// DBUS service
var service;

var needRender = function() {
    if (updateCallback)
        updateCallback();
};

/* we trigger status update via dbus
 * if we don't get a timely reply, consider subscription-manager failure
 */
var updateTimeout;

/*
 * Parses lines like:
 *
 * id:  text
 */
var parseSingleSubscription = function(text) {
    var ret = { };
    $.each(text.split('\n'), function(i, line) {
        var pos = line.indexOf(':');
        if (pos !== -1)
            ret[line.substring(0, pos)] = line.substring(pos + 1).trim();
    });
    return ret;
};

var parseMultipleSubscriptions = function(text) {
    var ret = [ ];
    var parts = text.split('\n\n');
    var i;
    for (i = 0; i < parts.length; ++i) {
        var segment = parts[i];
        if (segment.indexOf('Product Name:') === -1)
            continue;

        var segmentInfo = parseSingleSubscription(segment);

        var status = segmentInfo['Status'];

        /* if we have status details, add those to the status */
        if (segmentInfo['Status Details'] !== '')
            status = status + ' (' + segmentInfo['Status Details'] + ')';

        /* convert text output to mustache template variables */
        ret.push({
            'productName': segmentInfo['Product Name'],
            'productId': segmentInfo['Product ID'],
            'version': segmentInfo['Version'],
            'arch': segmentInfo['Arch'],
            'status': status,
            'starts': segmentInfo['Starts'],
            'ends': segmentInfo['Ends'],
        });
    }
    return ret;
};

var gettingDetails = false;
var getDetailsRequested = false;
function getSubscriptionDetails() {
    /* TODO DBus API doesn't deliver what we need, so we call subscription manager
     * without translations and parse the output
     */
    if (gettingDetails) {
        getDetailsRequested = true;
        return;
    }
    getDetailsRequested = false;
    gettingDetails = true;
    cockpit.spawn(['subscription-manager', 'list'],
            { directory: '/', superuser: "try", environ: ['LC_ALL=C'] })
        .done(function(output) {
            client.subscriptionStatus.products = parseMultipleSubscriptions(output);
            gettingDetails = false;
            if (getDetailsRequested)
                getSubscriptionDetails();
            needRender();
        })
        .fail(function(ex) {
            client.subscriptionStatus.error = ex;
            console.warn("Subscriptions [getSubscriptionDetails]: couldn't get details: " + ex);
            if (getDetailsRequested)
                getSubscriptionDetails();
            needRender();
        });
}

client.registerSystem = function(subscriptionDetails) {
    var deferred = $.Deferred();

    var args = ['subscription-manager', 'register'];
    if (subscriptionDetails.url != 'default')
        args.push('--serverurl', subscriptionDetails.serverUrl);

    // activation keys can't be used with auto-attach
    if (subscriptionDetails.activationKeys)
        args.push('--activationkey', subscriptionDetails.activationKeys);
    else
        args.push('--auto-attach');

    if (subscriptionDetails.user || subscriptionDetails.password)
        args.push('--username', subscriptionDetails.user, '--password', subscriptionDetails.password);

    // proxy is optional
    if (subscriptionDetails.proxy) {
        args.push('--proxy', subscriptionDetails.proxyServer,
                  '--proxyuser', subscriptionDetails.proxyUser,
                  '--proxypass', subscriptionDetails.proxyPass);
    }

    // only pass org info if user provided it
    if (subscriptionDetails.org)
        args.push('--org', subscriptionDetails.org);

    /* TODO DBus API doesn't deliver what we need, so we call subscription manager
     * without translations and parse the output
     */
    var process = cockpit.spawn(args, {
        directory: '/',
        superuser: "require",
        environ: ['LC_ALL=C'],
        err: "out"
    });

    var promise;
    var buffer = '';
    process
        .input('')
        .stream(function(text) {
            buffer += text;
        })
        .done(function(output) {
            deferred.resolve();
        })
        .fail(function(ex) {
            if (ex.problem === "cancelled") {
                deferred.reject(ex);
                return;
            }

            /* detect error types we recognize, fall back is generic error */
            var invalidUsernameString = 'Invalid username or password.';
            var invalidCredentialsString = 'Invalid Credentials';
            var message = buffer.trim();
            if (buffer.indexOf(invalidUsernameString) === 0) {
                message = buffer.substring(invalidUsernameString.length).trim();
            } else if (buffer.indexOf(invalidCredentialsString) === 0) {
                message = buffer.substring(invalidCredentialsString.length).trim();
            } else if ((buffer.indexOf('EOF') === 0) && (buffer.indexOf('Organization: ') !== -1)) {
                message = _("'Organization' required to register.");
            } else if ((buffer.indexOf('EOF') === 0) && (buffer.indexOf('Username: ') !== -1)) {
                message = _("Login/password or activation key required to register.");
            } else if (buffer.indexOf('Must provide --org with activation keys') !== -1) {
                message = _("'Organization' required when using activation keys.");
            } else if (buffer.indexOf('The system has been registered') === 0) {
                /*
                 * Currently we don't separate registration & subscription.
                 * Our auto-attach may have failed, so close the dialog and
                 * update status.
                 */
                deferred.resolve();
                return;
            }
            var error = new Error(message);
            deferred.reject(error);
        });

    promise = deferred.promise();
    promise.cancel = function cancel() {
        process.close("cancelled");
        // we have no idea what the current state is
        requestUpdate();
    };

    return promise;
};

client.unregisterSystem = function() {
    var deferred = $.Deferred();

    var args = ['subscription-manager', 'unregister'];

    /* TODO DBus API doesn't deliver what we need, so we call subscription manager
     * without translations and parse the output
     */
    var process = cockpit.spawn(args, {
        directory: '/',
        superuser: "require",
        environ: ['LC_ALL=C'],
        err: "out"
    });

    client.subscriptionStatus.status = "unregistering";
    needRender();
    var promise;
    var buffer = '';
    process
        .input('')
        .stream(function(text) {
            buffer += text;
        })
        .done(function(output) {
            deferred.resolve();
        })
        .fail(function(ex) {
            if (ex.problem === "cancelled") {
                deferred.reject(ex);
                return;
            }
            var error = new Error(buffer.trim());
            deferred.reject(error);
            requestUpdate();
        });

    promise = deferred.promise();
    promise.cancel = function cancel() {
        process.close("cancelled");
        // we have no idea what the current state is
        requestUpdate();
    };

    return promise;
};

function statusUpdateFailed() {
    if (updateTimeout !== null) {
        client.subscriptionStatus.status = "not-found";
        needRender();
    }
    updateTimeout = null;
}

/* request update via DBus
 * possible status values: https://github.com/candlepin/subscription-manager/blob/30c3b52320c3e73ebd7435b4fc8b0b6319985d19/src/rhsm_icon/rhsm_icon.c#L98
 * [ RHSM_VALID, RHSM_EXPIRED, RHSM_WARNING, RHN_CLASSIC, RHSM_PARTIALLY_VALID, RHSM_REGISTRATION_REQUIRED ]
 */
var subscriptionStatusValues = [
    'RHSM_VALID',
    'RHSM_EXPIRED',
    'RHSM_WARNING',
    'RHN_CLASSIC',
    'RHSM_PARTIALLY_VALID',
    'RHSM_REGISTRATION_REQUIRED'
];
var requestUpdate = function() {
    service.call(
        '/EntitlementStatus',
        'com.redhat.SubscriptionManager.EntitlementStatus',
        'check_status',
        [])
        .done(function(result) {
            client.subscriptionStatus.serviceStatus = subscriptionStatusValues[result[0]];
            updateTimeout = null;
            client.getSubscriptionStatus();
        })
        .catch(function(ex) {
            client.subscriptionStatus.serviceStatus = undefined;
            updateTimeout = null;
            console.warn("EntitlementStatus.check_status() failed:", ex);
        });

    /* TODO: Don't use a timeout here. Needs better API */
    updateTimeout = window.setTimeout(statusUpdateFailed, 30000);
};

function processStatusOutput(text, exitDetails) {
    if (exitDetails.problem === 'access-denied') {
        client.subscriptionStatus.status = "access-denied";
        needRender();
        return;
    }
    /* if output isn't as expected, maybe not properly installed? */
    if (text.indexOf('Overall Status:') === -1) {
        console.warn(text, exitDetails);
        client.subscriptionStatus.status = "not-found";
        return;
    }

    /* clear old subscription details */
    client.subscriptionStatus.products = [];

    var status = parseSingleSubscription(text);
    client.subscriptionStatus.status = status['Overall Status'];

    needRender();

    /* if refresh was requested, try again - otherwise get details */
    if (client.subscriptionStatus !== 'Unknown')
        getSubscriptionDetails();
}

var gettingStatus = false;
var getStatusRequested = false;
/* get subscription summary using 'subscription-manager status'*/
client.getSubscriptionStatus = function() {
    if (gettingStatus) {
        getStatusRequested = true;
        return;
    }
    getStatusRequested = false;
    gettingStatus = true;
    /* we need a buffer for 'subscription-manager status' output, since that can fail with a return code != 0
     * even if we need its output (no valid subscription)
     */
    var status_buffer = '';
    /* TODO DBus API doesn't deliver what we need, so we call subscription manager
     * without translations and parse the output
     *
     * 'subscription-manager status' will only return with exit code 0 if all is well (and subscriptions current)
     */
    cockpit.spawn(['subscription-manager', 'status'],
            { directory: '/', superuser: "try", environ: ['LC_ALL=C'], err: "out" })
        .stream(function(text) {
            status_buffer += text;
            return text.length;
        }).done(function(text) {
            gettingStatus = false;
            processStatusOutput(status_buffer + text, undefined);
            if (getStatusRequested)
                client.getSubscriptionStatus();
        }).fail(function(ex) {
            gettingStatus = false;
            processStatusOutput(status_buffer, ex);
            if (getStatusRequested)
                client.getSubscriptionStatus();
        });
};

/* ideally we could get detailed subscription info via DBus, but we
 * can't rely on this being present on all systems we work on
 */
/*service.subscribe(
    { path: "/EntitlementStatus",
      interface: "org.freedesktop.DBUS.Properties",
      member: "PropertiesChanged"
    }, function(path, interface, signal, args) {
    current.text('got properties');
});*/

// dataChanged: callback that is called with new data when render is needed
client.init = function(dataChanged) {
    updateCallback = dataChanged;

    service = cockpit.dbus('com.redhat.SubscriptionManager');

    /* we want to get notified if subscription status of the system changes */
    service.subscribe(
        { path: '/EntitlementStatus',
          interface: 'com.redhat.SubscriptionManager.EntitlementStatus',
          member: 'entitlement_status_changed'
        },
        function(path, dbus_interface, signal, args) {
            updateTimeout = null;
            /*
             * status has changed, now get actual status via command line
             * since older versions of subscription-manager don't deliver this via DBus
             * note: subscription-manager needs superuser privileges
             */

            client.getSubscriptionStatus();
        }
    );

    // get initial status
    requestUpdate();
};

return client;
});
