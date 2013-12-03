/**
 *
 * @license    http://www.gnu.org/licenses/gpl.html GPL Version 3
 * @author     Ian Moore <imooreyahoo@gmail.com>
 * @author     Marcel Beck <marcel.beck@mbeck.org>
 * @copyright  Copyright (c) 2011 Ian Moore
 * @copyright  Copyright (c) 2012 Marcel Beck
 *
 * This file is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * This file is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this file. If not, see <http://www.gnu.org/licenses/>.
 *
 */
// require("js/omv/WorkspaceManager.js")
// require("js/omv/workspace/form/Panel.js")
// require("js/omv/workspace/window/Form.js")
// require("js/omv/data/Store.js")
// require("js/omv/data/Model.js")
// require("js/omv/data/proxy/Rpc.js")
// require("js/omv/workspace/window/plugin/ConfigObject.js")
// require("js/omv/form/field/SharedFolderComboBox.js")

Ext.define("OMV.module.admin.service.openvpn.Settings", {
    extend : "OMV.workspace.form.Panel",
    uses   : [
        "OMV.data.Model",
        "OMV.data.Store"
    ],

    rpcService   : "OpenVPN",
    rpcGetMethod : "getSettings",
    rpcSetMethod : "setSettings",

    getFormItems:function () {
        return [{
            xtype    : "fieldset",
            title    : _("General settings"),
            id       : this.getId() + '-general',
            defaults : { labelSeparator:"" },
            items    : [{
                xtype      : "checkbox",
                name       : "enable",
                fieldLabel : _("Enable"),
                checked    : false,
                listeners  : {
                    scope : this
                }
            },{
                xtype         : "combo",
                name          : "protocol",
                fieldLabel    : _("Protocol"),
                queryMode     : "local",
                store         : [
                    [ "udp", _("UDP") ],
                    [ "tcp", _("TCP") ]
                ],
                editable      : false,
                triggerAction : "all",
                allowBlank    : false,
                value         : "udp",
                plugins       : [{
                    ptype : "fieldinfo",
                    text  : _("OpenVPN is designed to operate optimally over UDP, but TCP capability is provided for situations where UDP cannot be used.")
                }]
            },{
                xtype         : "numberfield",
                name          : "port",
                fieldLabel    : _("Port"),
                minValue      : 0,
                maxValue      : 65535,
                allowDecimals : false,
                allowNegative : false,
                allowBlank    : false,
                value         : 1194,
                plugins       : [{
                    ptype : "fieldinfo",
                    text  : _("Port to listen on.")
                }]
            },{
                xtype      : "checkbox",
                name       : "compression",
                fieldLabel : _("Data compression"),
                checked    : false,
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("OpenVPN clients must also have this configured in order to connect.")
                }]
            },{
                xtype      : "checkbox",
                name       : "auth",
                fieldLabel : _("Require authentication"),
                checked    : false,
                boxLabel   : _("In addition to having a valid client certificate, users must authenticate and be a member of the openvpn group."),
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("OpenVPN clients must also have this configured in order to connect.")
                }]
            },{
                xtype      : "textarea",
                name       : "extraoptions",
                fieldLabel : _("Extra options"),
                allowBlank : true,
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("Extra options for openvpn configuration file.")
                }]
            },{
                xtype         : "combo",
                name          : "loglevel",
                fieldLabel    : _("Logging level"),
                queryMode     : "local",
                store         : [
                    [ "0", _('No output except fatal errors') ],
                    [ "2", _('Normal usage output') ],
                    [ "5", _('Log each packet') ],
                    [ "7", _('Debug') ]
                ],
                editable      : false,
                triggerAction : "all",
                value         : "2"
            }]
        },{
            xtype : "fieldset",
            title : _("VPN Access"),
            id    : this.getId() + '-vpnaccess',
            items : [{
                border : false,
                html   : '<p>' + _('These fields define how OpenVPN will be accessed from the public internet. Enter a public DNS  resolvable name or IP address at which this server can be reached in Public Address. The Public Port field is only required if it differs from the Port setting in General Settings.') + '</p><br />'
            },{
                xtype      : "textfield",
                fieldLabel : _("Public Address"),
                name       : "publicip",
                allowBlank : false
            },{
                xtype      : "textfield",
                fieldLabel : _("Public Port"),
                name       : "publicport"
            }]
        },{
            xtype : "fieldset",
            title : "VPN Network",
            id    : this.getId() + '-vpnnetwork',
            items : [{
                border : false,
                html   : _("Your VPN Network Address and Network Mask should define a network in <a href='http://en.wikipedia.org/wiki/Private_network' target=_blank>private address space</a> that is NOT within the same network that you are routing.") + "<br /><br />"
            },{
                xtype         : "combo",
                name          : "vpn-route",
                fieldLabel    : _("Route"),
                emptyText     : _("Select ..."),
                allowBlank    : false,
                allowNone     : false,
                editable      : false,
                triggerAction : "all",
                displayField  : "text",
                valueField    : "netid",
                store         : Ext.create("OMV.data.Store", {
                    autoLoad : true,
                    model    : OMV.data.Model.createImplicit({
                        idProperty : "netid",
                        fields     : [
                            { name : "netid", type : "string"},
                            { name : "text", type : "string"}
                        ]
                    }),
                    proxy    : {
                        type : "rpc",
                        rpcData : {
                            service : "OpenVPN",
                            method : "getNetwork"
                        },
                        appendSortParams : false
                    },
                    sorters : [{
                        direction : "ASC",
                        property  : "devicefile"
                    }]
                }),
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("ALL - This will route and NAT all VPN client network traffic through the VPN, including general internet web browsing. In order for DNS to work for VPN clients, you should specify DNS server(s) in the DHCP options section.") +
                            "<br />" +
                            _("NONE - No routes will be pushed to VPN clients.") +
                            "<br />" +
                            _("VPN client traffic destined for ") + "ip" + (" will be routed to the OpenMediaVault server") +
                            "<br />" +
                            _("This will route and NAT VPN client traffic destined for the local network")
                }]
            },{
                xtype      : "label",
                id         : this.getId() + '-route-desc',
                text       : " - ",
                fieldLabel : " "
            },{
                xtype      : "textfield",
                fieldLabel : _("Network Address"),
                name       : "vpn-network",
                value      : "10.8.0.0",
                vtype      : "IPv4Net",
                allowBlank : false
            },{
                xtype      : "textfield",
                name       : "vpn-mask",
                fieldLabel : _("Network Mask"),
                value      : "255.255.255.0",
                vtype      : "IPv4Net",
                allowBlank : false
            },{
                xtype      : "checkbox",
                name       : "client-to-client",
                checked    : false,
                fieldLabel : " ",
                boxLabel   : _("Allow client-to-client communication over the VPN")
            }]
        },{
            xtype : "fieldset",
            title : "DHCP Options",
            id    : this.getId() + '-dhcp',
            items : [{
                html : "<p>" + _('These fields define DHCP options that will be sent to connecting OpenVPN clients. If you specify DNS or WINS serviers, be sure that they are reachable from the VPN client. Unless you  have chosen to route all traffic from your VPN clients, any servers specified here should be in the  local network you have chosen to route.') + "</p><br /><p> </p>"
            },{
                xtype      : "textfield",
                fieldLabel : _("DNS server(s)"),
                name       : "dns",
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("Separate multiple entries with commas")
                }]
            },{
                xtype      : "textfield",
                fieldLabel : _("DNS search domain(s)"),
                name       : "dns-domains",
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("Separate multiple entries with commas")
                }]
            },{
                xtype      : "textfield",
                fieldLabel : _("WINS server(s)"),
                name       : "wins",
                plugins    : [{
                    ptype : "fieldinfo",
                    text  : _("Separate multiple entries with commas")
                }]
            }]
        }];
    }
});

OMV.WorkspaceManager.registerPanel({
    id        : "settings",
    path      : "/service/openvpn",
    text      : _("Settings"),
    position  : 20,
    className : "OMV.module.admin.service.openvpn.Settings"
});
