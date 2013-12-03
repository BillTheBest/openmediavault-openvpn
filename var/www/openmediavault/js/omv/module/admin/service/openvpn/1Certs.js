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

Ext.define("OMV.module.admin.service.openvpn.Certs", {
    extend : "OMV.workspace.form.Panel",
    uses   : [
        "OMV.data.Model",
        "OMV.data.Store"
    ],

    rpcService   : "OpenVPN",
    rpcGetMethod : "getCommands",

    getFormItems : function() {
        var me = this;

        return [{
            xtype    : "fieldset",
            title    : _("Commands"),
            defaults : {
                labelSeparator : ""
            },
            items    : [{
                border : false,
                html   :   "<ul><li>" +
                         _("The first step in building an OpenVPN configuration is to establish a PKI (public key infrastructure). The PKI consists of:") +
                           "<ul><li>" +
                         _("a separate certificate (also known as a public key) and private key for the server and each client") +
                           "</li><li>" +
                         _("a master Certificate Authority (CA) certificate and key which is used to sign each of the server and client certificates") +
                           "</li></ul></li><li>" +
                         _("OpenVPN supports bidirectional authentication based on certificates, meaning that the client must authenticate the server certificate and the server must authenticate the client certificate before mutual trust is established.") +
                           "</li><li>" +
                         _("Both server and client will authenticate the other by first verifying that the presented certificate was signed by the master certificate authority (CA), and then by testing information in the now-authenticated certificate header, such as the certificate common name or certificate type (client or server).") +
                           "</li></ul>"
            }]
        },{
            xtype  : 'fieldset',
            title  : _('Certificate Authority'),
            itemId : 'ca-no',
            items  : [{
                border : false,
                html   : "<p>" + _("No certificate authority has been created for OpenVPN. A certificate authority is required to generate server and client certificates. Click the Create Certificate Authority button below to get started.") + "</p>"
            },{
                xtype   : 'button',
                style   : { margin:'10px' },
                text    : _("Create Certificate Authority"),
                handler : this.cbCAWizard,
                scope   : this
            }]
        },{
            xtype        : 'fieldset',
            title        : _('Certificate Authority'),
            layout       : 'table',
            defaults     : { style:{ marginRight:'20px'}},
            layoutConfig : {
                // The total column count must be specified here
                columns:3
            },
            itemId : 'ca',
            items  : [{
                border : false,
                html   : "<p>" + _("A certificate authority has been created for OpenVPN.") + "</p>"
            },{
                xtype   : 'button',
                text    : _('Download CA Certificate'),
                handler : function () {
                    OMV.Download.request("OpenVPN", "downloadCert", "ca");
                }
            },{
                xtype   : 'button',
                text    : _("Recreate CA"),
                handler : function () {
                    Ext.MessageBox.show({
                        title   : _("Confirmation"),
                        msg     : _("Do you really want to recreate the Certificate Authority for OpenVPN? This will invalidate all existing OpenVPN certificates."),
                        buttons : Ext.MessageBox.YESNO,
                        fn      : function (answer) {
                            if (answer == "no") {
                                return;
                            }
                            this.cbCAWizard();
                        },
                        scope   : this,
                        icon    : Ext.MessageBox.QUESTION
                    });
                },
                scope   : this
            }]
        },{
            xtype  : 'fieldset',
            title  : _('Server Certificate'),
            itemId : 'server-cert-no',
            items  : [{
                border : false,
                html   :"<p>" + _("No server certificate has been generate for OpenVPN. Click the Generate Server Certificate button below to get started") + "</p>"
            },{
                xtype   : 'button',
                itemId  : 'createCert',
                style   : { margin:'10px' },
                text    : _("Generate Server Certificate"),
                handler : this.cbServerCertWizard,
                scope   : this
            }]
        },{
            xtype        : 'fieldset',
            title        : _("Server Certificate"),
            layout       : 'table',
            layoutConfig : {
                // The total column count must be specified here
                columns : 3
            },
            itemId       : 'server-cert',
            defaults     : { style:{ marginRight:'20px'}},
            items        : [{
                border : false,
                html   : "<p>" + _("A server certificate has been generated for OpenVPN.") + "</p>"
            },{
                xtype  :'button',
                text   :_("Regenerate Server Certificate"),
                handler:function () {
                    Ext.MessageBox.show({
                        title  :_("Confirmation"),
                        msg    :_("Do you really want to regenerate the Server Certificate for OpenVPN?"),
                        buttons:Ext.MessageBox.YESNO,
                        fn     :function (answer) {
                            if (answer == "no") {
                                return;
                            }
                            this.cbServerCertWizard();
                        },
                        scope  :this,
                        icon   :Ext.MessageBox.QUESTION
                    });
                },
                scope  :this
            }]
        }];
    }
});

OMV.WorkspaceManager.registerPanel({
    id        : "certs",
    path      : "/service/openvpn",
    text      : _("Certs"),
    position  : 10,
    className : "OMV.module.admin.service.openvpn.Certs"
});
