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
    "base1/cockpit",
    "subscriptions/react",
    "subscriptions/cockpit-components-select",
], function(cockpit, React, Select) {

    "use strict";
    var _ = cockpit.gettext;

    function defaultRegisterDialogSettings() {
        return {
            url: 'default',
            serverUrl: 'subscription.rhn.redhat.com',
            proxy: false,
            proxyServer: '',
            proxyUser: '',
            proxyPassword: '',
            user: '',
            password: '',
            activationKeys: '',
            org: '',
        };
    }
    /* Subscriptions: registration dialog body
     * Expected props:
     *   - onChange  callback to signal when the data has changed
     *   - properties as in defaultRegisterDialogSettings()
     */
    var PatternDialogBody = React.createClass({
        handleUseProxyClick: function(event) {
            this.props.onChange('proxy', !this.props.proxy);
            // don't actually navigate
            event.preventDefault();
        },
        render: function() {
            var customURL;
            if (this.props.url == 'custom') {
                customURL = (
                    <input id="subscription-register-url-custom" className="form-control" type="text"
                     value={this.props.serverUrl} onChange={this.props.onChange.bind(this, 'serverUrl')} />
                );
            }
            var proxy;
            if (this.props.proxy) {
                proxy = [
                    <tr>
                        <td />
                        <td className="top form-td-ct-subscriptions">
                            <label className="control-label form-tr-ct-title" for="subscription-proxy-server">
                                {_("Server")}
                            </label>
                        </td>
                        <td>
                            <input id="subscription-proxy-server" className="form-control" type="text"
                                   placeholder="hostname:port" value={this.props.proxyServer}
                                   onChange={this.props.onChange.bind(this, 'proxyServer')}/>
                        </td>
                    </tr>,
                    <tr>
                        <td />
                        <td className="top form-td-ct-subscriptions">
                            <label className="control-label form-tr-ct-title" for="subscription-proxy-user">
                                {_("User")}
                            </label>
                        </td>
                        <td>
                            <input id="subscription-proxy-user" className="form-control" type="text"
                                   value={this.props.proxyUser}
                                   onChange={this.props.onChange.bind(this, 'proxyUser')}/>
                        </td>
                    </tr>,
                    <tr>
                        <td />
                        <td className="top form-td-ct-subscriptions">
                            <label className="control-label form-tr-ct-title" for="subscription-proxy-password">
                                {_("Password")}
                            </label>
                        </td>
                        <td>
                            <input id="subscription-proxy-password" className="form-control" type="password"
                                   value={this.props.proxyPassword}
                                   onChange={this.props.onChange.bind(this, 'proxyPassword')}/>
                        </td>
                    </tr>
                ];
            }
            return (
                <div className="modal-body">
                    <table className="form-table-ct">
                        <tr>
                            <td className="top">
                                <label className="control-label" for="subscription-register-url">
                                    {_("URL")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <Select.Select key='urlSource' onChange={ this.props.onChange.bind(this, 'url') }
                                               id="subscription-register-url" initial={this.props.url}>
                                    <Select.SelectEntry data='default' key='default'>{_("Default")}</Select.SelectEntry>
                                    <Select.SelectEntry data='custom' key='custom'>{_("Custom URL")}</Select.SelectEntry>
                                </Select.Select>
                                {customURL}
                            </td>
                        </tr>
                        <tr>
                            <td className="top">
                                <label className="control-label">
                                    {_("Proxy")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <label>
                                    <input id="subscription-proxy-use" type="checkbox" checked={this.props.proxy}
                                           onChange={ this.props.onChange.bind(this, 'proxy') }/>
                                    {_("use proxy server")}
                                </label>
                            </td>
                        </tr>
                        {proxy}
                        <tr>
                            <td className="top ">
                                <label className="control-label" for="subscription-register-username">
                                    {_("Login")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <input id="subscription-register-username" className="form-control" type="text"
                                       value={this.props.user}
                                       onChange={this.props.onChange.bind(this, 'user')}/>
                            </td>
                        </tr>
                        <tr>
                            <td className="top">
                                <label className="control-label" for="subscription-register-password">
                                    {_("Password")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <input id="subscription-register-password" className="form-control" type="password"
                                       value={this.props.password}
                                       onChange={this.props.onChange.bind(this, 'password')}/>
                            </td>
                        </tr>
                        <tr>
                            <td className="top">
                                <label className="control-label" for="subscription-register-key">
                                    {_("Activation Key")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <input id="subscription-register-key" className="form-control" type="text"
                                       placeholder="key_one,key_two" value={this.props.activationKeys}
                                       onChange={this.props.onChange.bind(this, 'activationKeys')}/>
                            </td>
                        </tr>
                        <tr>
                            <td className="top">
                                <label className="control-label" for="subscription-register-org">
                                    {_("Organization")}
                                </label>
                            </td>
                            <td colSpan="2">
                                <input id="subscription-register-org" className="form-control" type="text"
                                       value={this.props.org}
                                       onChange={this.props.onChange.bind(this, 'org')}/>
                            </td>
                        </tr>
                    </table>
                </div>
            );
        }
    });

    return {
        defaultSettings: defaultRegisterDialogSettings,
        dialogBody: PatternDialogBody,
    };
});
