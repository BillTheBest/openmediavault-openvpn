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
// require("js/omv/Window.js")
// require("js/omv/NavigationPanel.js")
// require("js/omv/data/DataProxy.js")
// require("js/omv/FormPanelExt.js")
// require("js/omv/grid/GridPanel.js")
// require("js/omv/grid/TBarGridPanel.js")
// require("js/omv/CfgObjectDialog.js")
// require("js/omv/form/SharedFolderComboBox.js")
// require("js/omv/form/PasswordField.js")
// require("js/omv/form/plugins/FieldInfo.js")
// require("js/openvpn/wizard.js")
// require("js/omv/module/admin/Logs.js")
// require("js/omv/util/Format.js")

Ext.ns("OMV.Module.Services");

//Register the menu.
OMV.NavigationPanelMgr.registerMenu("services", "openvpn", {
	text    :_("OpenVPN"),
	icon    :"images/openvpn.png",
	position:1000
});

/**
 * @class OMV.Module.Services.OpenVPN
 * @derived OMV.FormPanelExt
 *
 * Main configuration panel. First tab
 *
 */
OMV.Module.Services.OpenVPN = function (config) {
	var initialConfig = {
		rpcService:"OpenVPN"
	};
	Ext.apply(initialConfig, config);
	OMV.Module.Services.OpenVPN.superclass.constructor.call(this, initialConfig);
};
Ext.extend(OMV.Module.Services.OpenVPN, OMV.FormPanelExt, {

	id   :'OMV.Module.Services.OpenVPN',

	// Hold loaded data for wizard population	
	_data:{},

	initComponent     :function () {

		OMV.Module.Services.OpenVPN.superclass.initComponent.apply(this, arguments);

		// Update form fields
		this.on("load", function (t, r) {

			// Hold data for later reference
			this._data = r;

			var p = this.findFormField('vpn-route');
			p.fireEvent('select', p);

			// Check for CA items
			var fsets = ['general', 'vpnnetwork', 'vpnaccess', 'dhcp'];
			var tabs = ['OMV.Module.Services.OpenVPN.Status', 'OMV.Module.Services.OpenVPN.ClientCertsGridPanel' ];
			var pid = this.getId();

			// Trigger show on this to update various sub-fields
			var pkiFrame = Ext.getCmp(pid + '-pki');
			pkiFrame.fireEvent('show', pkiFrame);

			// No CA or server
			if (!r['ca-exists'] || !r['server-cert-exists']) {
				for (var i = 0; i < fsets.length; i++) {
					Ext.getCmp(pid + '-' + fsets[i]).hide();
				}
				for (var i = 0; i < tabs.length; i++) {
					Ext.getCmp(tabs[i]).disable();
				}
				// disable OK and Reset buttons
				this.setButtonDisabled("ok", true);
				this.setButtonDisabled("reset", true);

				// Both exist. Ready for configuration
			}
			else {
				for (var i = 0; i < fsets.length; i++) {
					Ext.getCmp(pid + '-' + fsets[i]).show();
				}
				for (var i = 0; i < tabs.length; i++) {
					Ext.getCmp(tabs[i]).enable();
				}
				// enable OK and Reset buttons
				this.setButtonDisabled("ok", false);
				this.setButtonDisabled("reset", false);
			}

		}, this);
	},

	/* Override reset button. Who cares what the original
	 * form values were.
	 */
	reset             :function () {
		this.doLoad();
	},

	/* Overridden to set labels */
	setValues         :function (values) {
		var basicForm = this.getForm();
		basicForm.setValues(values);
		for (v in values) {
			var f = this.find('name', v)[0];
			if (f && f.getXType() == 'label') {
				f.setText(values[v]);
			}
		}
		return basicForm;
	},

	/*
	 * Server certificate wizard
	 */
	cbServerCertWizard:function () {

		var pData = this._data;

		var caWiz = new OMV.Module.Services.OpenVPNWizard({
			title      :_('Create Server Certificate Wizard'),
			method     :'createServerCertificate',
			afterSubmit:function () {
				Ext.getCmp('OMV.Module.Services.OpenVPN').doLoad();
			},
			steps      :[
				{
					id  :'card-0',
					html:'<h1>' + _('Welcome to the Create Server Certificate Wizard!') + '</h1>' +
									'<p style="margin-top: 10px">' + _('OpenVPN supports bidirectional authentication based on certificates, meaning that the client must authenticate the server certificate and the server must authenticate the client certificate before mutual trust is established.</p><br /><p>This wizard will guide you through creating the OpenVPN server certificate that will be presented to VPN clients for verification.') + '</p>'
				},
				{
					id       :'card-1',
					defaults :{ border:false },
					listeners:{
						show:function (f) {
							// Check for existing values in server-cert-commonname
							// if not set, use CA values
							if (!pData['server-cert-commonname']) {
								sData = {};
								for (var i in pData) {
									// Skip common name and use form default
									if (i == 'ca-commonname') {
										continue;
									}
									if (i.indexOf('ca-') === 0) {
										sData[i.replace('ca-', 'server-cert-')] = pData[i];
									}
								}
							}
							else {
								sData = pData;
							}
							f.findParentByType('form').getForm().setValues(sData);
						}
					},
					items    :[
						{
							html:'<h1>Server Certificate Configuration</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">Please enter ' +
											'values below that best describe the OpenVPN server.</p>'
						},
						{
							xtype   :'fieldset',
							border  :true,
							title   :_('Server Certificate Details'),
							defaults:{ allowBlank:false, maxLength:64, xtype:'textfield', anchor:'100%' },
							items   :[
								{
									name      :'server-cert-commonname',
									fieldLabel:_('Common name'),
									value     :location.host,
									allowBlank:false
								},
								{
									xtype        :'combo',
									name         :'server-cert-country',
									hiddenName   :'server-cert-country',
									fieldLabel   :'Country',
									valueField   :'id',
									displayField :'text',
									emptyText    :_("Select a country ..."),
									allowBlank   :false,
									allowNone    :false,
									width        :300,
									editable     :false,
									triggerAction:"all",
									store        :new OMV.data.Store({
										remoteSort:false,
										proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getCountries"}),
										reader    :new Ext.data.JsonReader({
											idProperty:"id",
											fields    :[
												{ name:"id" },
												{ name:"text" }
											]
										})
									})
								},
								{
									name      :'server-cert-province',
									fieldLabel:_('Province / State')
								},
								{
									name      :'server-cert-city',
									fieldLabel:_('City')
								},
								{
									name      :'server-cert-org',
									fieldLabel:_('Organization')
								},
								{
									name      :'server-cert-email',
									fieldLabel:_('E-Mail address'),
									vtype     :"email"
								}
							]

						}
					]
				},
				{
					id       :'card-3',
					xtype    :'panel',
					layout   :'form',
					defaults :{ border:false},
					listeners:{
						show:function (f) {

							// Set labels
							var vals = f.findParentByType('form').getForm().getValues();
							for (var v in vals) {
								var dFields = f.find('name', v + '-label');
								if (dFields[0] && dFields[0].setText) {
									dFields[0].setText(vals[v]);
								}
							}
							// Special cases for combo boxes
							f.find('name', 'server-cert-country-label')[0].setText(
											f.findParentByType('form').find('name', 'server-cert-country')[0]
															.getStore().getById(vals['server-cert-country']).get('text')
							);

						}
					},
					items    :[
						{
							html:'<h1>Summary</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">Clicking Finish below ' +
											'will create a server certificate with the following values:</p>'
						},
						{
							xtype   :'fieldset',
							border  :true,
							title   :_('Server Certificate Details'),
							defaults:{ allowBlank:false, width:220, xtype:'label'},
							items   :[
								{
									name      :'server-cert-commonname-label',
									fieldLabel:_('Common name')
								},
								{
									name      :'server-cert-country-label',
									fieldLabel:_('Country')
								},
								{
									name      :'server-cert-province-label',
									fieldLabel:_('Province / State')
								},
								{
									name      :'server-cert-city-label',
									fieldLabel:_('City')
								},
								{
									name      :'server-cert-org-label',
									fieldLabel:_('Organization')
								},
								{
									name      :'server-cert-email-label',
									fieldLabel:_('E-Mail address')
								}
							]


						}
					]
				}
			]

		});

		caWiz.show();
	},

	/*
	 * Cert auth wiz
	 */
	cbCAWizard        :function () {

		var pData = this._data;

		var caWiz = new OMV.Module.Services.OpenVPNWizard({
			title      :_('Create Certificate Authority Wizard'),
			method     :'createCa',
			afterSubmit:function () {
				Ext.getCmp('OMV.Module.Services.OpenVPN').doLoad();
			},
			steps      :[
				{
					html:'<h1>' + _('Welcome to the Create Certificate Authority Wizard!') + '</h1>' +
									'<p style="margin-top: 10px">' + _('This wizard will help you to create a new certificate authority for your OpenVPN service. A certificate authority (CA) is an entity that issues digital certificates. The digital certificate certifies the ownership of a public key by the named subject of the certificate. This verifies the identity of the entity presenting its public key. Server and client certificates generated here will be signed by this certificate authority.') + '</p>'
				},
				{
					xtype    :'panel',
					defaults :{ border:false, autoWidth:false },
					listeners:{
						show:function (f) {
							f.findParentByType('form').getForm().setValues(pData);
						}
					},
					items    :[
						{
							html:'<h1>Certificate Authority Configuration</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">Please enter ' +
											'values below that best describe the new certificate authority.</p>'
						},
						{
							xtype   :'fieldset',
							border  :true,
							layout  :'form',
							title   :_('Certificate Authority'),
							defaults:{ allowBlank:false, maxLength:64, xtype:'textfield', anchor:'100%' },
							items   :[
								{
									name      :'ca-commonname',
									fieldLabel:'Common name',
									value     :_("OpenVPN certificate authority at") + ' ' + location.host,
									allowBlank:false
								},
								{
									xtype        :'combo',
									name         :'ca-country',
									hiddenName   :'ca-country',
									fieldLabel   :_('Country'),
									valueField   :'id',
									displayField :'text',
									emptyText    :_("Select a country ..."),
									allowBlank   :false,
									allowNone    :false,
									editable     :false,
									triggerAction:"all",
									store        :new OMV.data.Store({
										remoteSort:false,
										proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getCountries"}),
										reader    :new Ext.data.JsonReader({
											idProperty:"id",
											fields    :[
												{ name:"id" },
												{ name:"text" }
											]
										})
									})
								},
								{
									name      :'ca-province',
									fieldLabel:_('Province / State')
								},
								{
									name      :'ca-city',
									fieldLabel:_('City')
								},
								{
									name      :'ca-org',
									fieldLabel:_('Organization')
								},
								{
									name      :'ca-email',
									fieldLabel:_('E-Mail address'),
									vtype     :"email"
								}
							]

						}
					]
				},
				{
					xtype   :'panel',
					layout  :'form',
					defaults:{ border:false},
					items   :[
						{
							html:'<h1>' + _('Key Store Data') + '</h1><p style="margin-top: 10px; margin-bottom: 10px">' +
											_('Choose the data volume on which the OpenVPN key store should be located.') + '</p>'
						},
						{
							xtype        :"combo",
							anchor       :'100%',
							name         :"mntentref",
							hiddenName   :"mntentref",
							hideLabel    :true,
							emptyText    :_("Select a volume ..."),
							allowBlank   :false,
							allowNone    :false,
							editable     :false,
							triggerAction:"all",
							displayField :"description",
							valueField   :"uuid",
							store        :new OMV.data.Store({
								remoteSort:false,
								proxy     :new OMV.data.DataProxy({"service":"ShareMgmt", "method":"getCandidates"}),
								reader    :new Ext.data.JsonReader({
									idProperty:"uuid",
									fields    :[
										{ name:"uuid" },
										{ name:"description" }
									]
								})
							})

						},
						{
							html:_('Using a data volume with redundancy will ensure that the OpenVPN key store will not be lost in the event of a root drive failure.')
						}
					]

				},
				{
					xtype    :'panel',
					layout   :'form',
					defaults :{ border:false},
					listeners:{
						show:function (f) {
							// Set labels
							var vals = f.findParentByType('form').getForm().getValues();
							for (var v in vals) {
								var dFields = f.find('name', v + '-label');
								if (dFields[0] && dFields[0].setText) {
									dFields[0].setText(vals[v]);
								}
							}
							// Special cases for combo boxes
							f.find('name', 'ca-country-label')[0].setText(
											f.findParentByType('form').find('name', 'ca-country')[0]
															.getStore().getById(vals['ca-country']).get('text')
							);

							f.find('name', 'keystore-datavol')[0].setText(
											f.findParentByType('form').find('name', 'mntentref')[0]
															.getStore().getById(vals['mntentref']).get('description')
							);

						}
					},
					items    :[
						{
							html:'<h1>Summary</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">Clicking Finish below ' +
											'will create a new certificate authority with the following values:</p>'
						},
						{
							xtype     :'label',
							name      :'ca-commonname-label',
							fieldLabel:_('Common name')
						},
						{
							xtype     :'label',
							name      :'ca-country-label',
							fieldLabel:_('Country')
						},
						{
							xtype     :'label',
							name      :'ca-province-label',
							fieldLabel:_('Province / State')
						},
						{
							xtype     :'label',
							name      :'ca-city-label',
							fieldLabel:_('City')
						},
						{
							xtype     :'label',
							name      :'ca-org-label',
							fieldLabel:_('Organization')
						},
						{
							xtype     :'label',
							name      :'ca-email-label',
							fieldLabel:_('E-Mail address')

						},
						{
							xtype     :'label',
							name      :'keystore-datavol',
							fieldLabel:_('Key store data volume')
						}
					]
				}
			]

		});

		caWiz.show();
	},

	getFormItems:function () {
		return [
			{
				xtype   :"fieldset",
				title   :_("General settings"),
				id      :this.getId() + '-general',
				defaults:{ labelSeparator:"" },
				items   :[
					{
						xtype     :"checkbox",
						name      :"enable",
						fieldLabel:_("Enable"),
						checked   :false,
						inputValue:1,
						listeners :{
							scope:this
						}
					},
					{
						xtype        :"combo",
						name         :"protocol",
						fieldLabel   :_("Protocol"),
						editable     :false,
						width        :60,
						triggerAction:"all",
						mode         :"local",
						store        :new Ext.data.SimpleStore({
							fields:[ "value", "text" ],
							data  :[
								[ "udp", _("UDP") ],
								[ "tcp", _("TCP") ]
							]
						}),
						displayField :"text",
						valueField   :"value",
						allowBlank   :false,
						value        :"udp",
						plugins      :[ OMV.form.plugins.FieldInfo ],
						infoText     :_("OpenVPN is designed to operate optimally over UDP, but TCP capability is provided for situations where UDP cannot be used.")
					},
					{
						xtype        :"numberfield",
						name         :"port",
						fieldLabel   :_("Port"),
						width        :60,
						vtype        :"port",
						minValue     :0,
						maxValue     :65535,
						allowDecimals:false,
						allowNegative:false,
						allowBlank   :false,
						value        :1194,
						plugins      :[ OMV.form.plugins.FieldInfo ],
						infoText     :_("Port to listen on.")
					},
					{
						xtype     :"checkbox",
						name      :"compression",
						fieldLabel:_("Data compression"),
						checked   :false,
						inputValue:1,
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("OpenVPN clients must also have this configured in order to connect.")
					},
					{
						xtype     :"checkbox",
						name      :"auth",
						fieldLabel:_("Require authentication"),
						checked   :false,
						inputValue:1,
						boxLabel  :_("In addition to having a valid client certificate, users must authenticate and be a member of the openvpn group."),
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("OpenVPN clients must also have this configured in order to connect.")
					},
					{
						xtype     :"textfield",
						name      :"extraoptions",
						fieldLabel:_("Extra options"),
						allowBlank:true,
						autoCreate:{
							tag         :"textarea",
							autocomplete:"off",
							rows        :"5",
							cols        :"75"
						},
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("Extra options for openvpn configuration file.")
					},
					{
						xtype        :"combo",
						name         :"loglevel",
						fieldLabel   :_("Logging level"),
						width        :300,
						editable     :false,
						triggerAction:"all",
						mode         :"local",
						value        :"2",
						store        :new Ext.data.SimpleStore({
							autoLoad:true,
							fields  :[ "value", "text" ],
							data    :[
								[ "0", _('No output except fatal errors')],
								[ "2", _('Normal usage output') ],
								[ "5", _('Log each packet') ],
								[ "7", _('Debug') ]
							]
						}),
						displayField :"text",
						valueField   :"value",
						allowBlank   :false
					}
				]
			},
			{
				xtype:"fieldset",
				title:_("VPN Access"),
				id   :this.getId() + '-vpnaccess',
				items:[
					{
						html:'<p>' + _('These fields define how OpenVPN will be accessed from the public internet. Enter a public DNS  resolvable name or IP address at which this server can be reached in Public Address. The Public Port field is only required if it differs from the Port setting in General Settings.') + '</p><br />'
					},
					{
						xtype     :"textfield",
						fieldLabel:_("Public Address"),
						name      :"publicip",
						width     :220,
						allowBlank:false
					},
					{
						xtype     :"textfield",
						fieldLabel:_("Public Port"),
						width     :60,
						name      :"publicport"
					}
				]
			},
			{
				xtype:"fieldset",
				title:"VPN Network",
				id   :this.getId() + '-vpnnetwork',
				items:[
					{
						html:_("Your VPN Network Address and Network Mask should define a network in <a href='http://en.wikipedia.org/wiki/Private_network' target=_blank>private address space</a> that is NOT within the same network that you are routing.") + "<br /><br />"
					},
					{
						xtype        :"combo",
						name         :"vpn-route",
						fieldLabel   :_("Route"),
						emptyText    :_("Select ..."),
						allowBlank   :false,
						allowNone    :false,
						width        :300,
						editable     :false,
						triggerAction:"all",
						displayField :"text",
						valueField   :"netid",
						store        :new OMV.data.Store({
							remoteSort:false,
							autoLoad  :true,
							proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getNetworks"}),
							reader    :new Ext.data.JsonReader({
								idProperty:"netid",
								fields    :[
									{name:"netid"},
									{name:"text"}
								]
							}),
							listeners :{
								load :function (s) {
									s.add([
										new Ext.data.Record({netid:'all', text:'All network traffic'})
									]);
									var p = this.findFormField('vpn-route');
									p.fireEvent('select', p);
								},
								scope:this
							}
						}),
						listeners    :{
							select:function (s) {
								var t = '';
								var val = s.getValue();
								switch (val) {
									case 'all':
										t = _("This will route and NAT all VPN client network traffic through the VPN, including general internet web browsing. In order for DNS to work for VPN clients, you should specify DNS server(s) in the DHCP options section.");
										break;
									default:
										if (val == 'none') {
											t = 'No routes will be pushed to VPN clients.';
										} else if (val.indexOf('255.255.255.255') > 0) {
											var ip = val.substring(0, val.indexOf(' /'));
											t = "VPN client traffic destined for " + ip + " will be routed to the OpenMediaVault server";
										}
										else {
											t = _("This will route and NAT VPN client traffic destined for the local network") + ' ' + val;
										}
								}
								Ext.getCmp(this.getId() + "-route-desc").setText(t);
							},
							scope :this
						}
					},
					{
						xtype     :"label",
						id        :this.getId() + '-route-desc',
						text      :" - ",
						fieldLabel:" "
					},
					{
						xtype     :"textfield",
						fieldLabel:_("Network Address"),
						name      :"vpn-network",
						value     :"10.8.0.0",
						vtype     :"IPv4Net",
						allowBlank:false
					},
					{
						xtype     :"textfield",
						name      :"vpn-mask",
						fieldLabel:_("Network Mask"),
						value     :"255.255.255.0",
						vtype     :"IPv4Net",
						allowBlank:false
					},
					{
						xtype     :"checkbox",
						name      :"client-to-client",
						checked   :false,
						inputValue:1,
						fieldLabel:" ",
						boxLabel  :_("Allow client-to-client communication over the VPN")
					}
				]
			},
			{
				xtype:"fieldset",
				title:"DHCP Options",
				id   :this.getId() + '-dhcp',
				items:[
					{
						html:"<p>" + _('These fields define DHCP options that will be sent to connecting OpenVPN clients. If you specify DNS or WINS serviers, be sure that they are reachable from the VPN client. Unless you  have chosen to route all traffic from your VPN clients, any servers specified here should be in the  local network you have chosen to route.') + "</p><br /><p> </p>"
					},
					{
						xtype     :"textfield",
						fieldLabel:_("DNS server(s)"),
						name      :"dns",
						width     :220,
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("Separate multiple entries with commas")
					},
					{
						xtype     :"textfield",
						fieldLabel:_("DNS search domain(s)"),
						name      :"dns-domains",
						width     :220,
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("Separate multiple entries with commas")
					},
					{
						xtype     :"textfield",
						fieldLabel:_("WINS server(s)"),
						width     :220,
						name      :"wins",
						plugins   :[ OMV.form.plugins.FieldInfo ],
						infoText  :_("Separate multiple entries with commas")
					}
				]
			},
			{
				xtype    :'fieldset',
				title    :_('OpenVPN Public Key Infrastructure'),
				id       :this.getId() + '-pki',
				listeners:{

					// Logic to show / hide fields based on pki and certificate status
					show:function (fs) {
						if (Ext.getCmp('OMV.Module.Services.OpenVPN')._data['ca-exists']) {
							fs.getComponent('ca-no').hide();
							fs.getComponent('ca').show();

							// check for server cert
							if (Ext.getCmp('OMV.Module.Services.OpenVPN')._data['server-cert-exists']) {
								fs.getComponent('server-cert-no').hide();
								fs.getComponent('server-cert').show();
							}
							else {
								fs.getComponent('server-cert').hide();
								fs.getComponent('server-cert-no').show();
							}

							// No CA, hide server certificate fields
						}
						else {
							fs.getComponent('ca').hide();
							fs.getComponent('ca-no').show();
							fs.getComponent('server-cert-no').hide();
							fs.getComponent('server-cert').hide();
						}
					}
				},
				items    :[
					{
						html:'<p>The first step in building an OpenVPN configuration is to establish ' +
										'a PKI (public key infrastructure). The PKI consists of:</p><br />' +
										'<p>(*) a separate certificate (also known as a public key) and ' +
										'private key for the server and each client, and<br /><br />(*) a master ' +
										'Certificate Authority (CA) certificate and key which is used to ' +
										'sign each of the server and client certificates.</p><br /><p>' +
										'OpenVPN supports bidirectional authentication based on certificates, ' +
										'meaning that the client must authenticate the server certificate and ' +
										'the server must authenticate the client certificate before mutual ' +
										'trust is established.</p><br /><p>Both server and client ' +
										'will authenticate the ' +
										'other by first verifying that the presented certificate was signed by ' +
										'the master certificate authority (CA), and then by testing information ' +
										'in the now-authenticated certificate header, such as the certificate ' +
										'common name or certificate type (client or server).</p><br />'
					},
					{
						xtype :'fieldset',
						title :_('Certificate Authority'),
						itemId:'ca-no',
						items :[
							{
								html:'<p>' + _('No certificate authority has been created for OpenVPN. A certificate authority is required to generate server and client certificates. Click the Create Certificate Authority button below to get started.') + '</p>'
							},
							{
								xtype  :'button',
								style  :{ margin:'10px' },
								text   :_('Create Certificate Authority'),
								handler:this.cbCAWizard,
								scope  :this
							}
						]
					},
					{
						xtype       :'fieldset',
						title       :_('Certificate Authority'),
						layout      :'table',
						defaults    :{ style:{ marginRight:'20px'}},
						layoutConfig:{
							// The total column count must be specified here
							columns:3
						},
						itemId      :'ca',
						items       :[
							{
								html:'<p>A certificate authority has been created for OpenVPN.</p>'
							},
							{
								xtype  :'button',
								text   :_('Download CA Certificate'),
								handler:function () {
									OMV.Download.request("OpenVPN", "downloadCert", "ca");
								}
							},
							{
								xtype  :'button',
								text   :_('Recreate CA'),
								handler:function () {
									Ext.MessageBox.show({
										title  :_("Confirmation"),
										msg    :_("Do you really want to recreate the Certificate Authority for OpenVPN? This will invalidate all existing OpenVPN certificates."),
										buttons:Ext.MessageBox.YESNO,
										fn     :function (answer) {
											if (answer == "no") {
												return;
											}
											this.cbCAWizard();
										},
										scope  :this,
										icon   :Ext.MessageBox.QUESTION
									});

								},
								scope  :this
							}
						]

					},
					{
						xtype :'fieldset',
						title :_('Server Certificate'),
						itemId:'server-cert-no',
						items :[
							{
								html:'<p>' + _('No server certificate has been generate for OpenVPN. Click the Generate Server Certificate button below to get started.') + '</p>'
							},
							{
								xtype  :'button',
								itemId :'createCert',
								style  :{ margin:'10px' },
								text   :_('Generate Server Certificate'),
								handler:this.cbServerCertWizard,
								scope  :this
							}
						]
					},
					{
						xtype       :'fieldset',
						title       :_('Server Certificate'),
						layout      :'table',
						layoutConfig:{
							// The total column count must be specified here
							columns:3
						},
						itemId      :'server-cert',
						defaults    :{ style:{ marginRight:'20px'}},
						items       :[
							{
								html:'<p>A server certificate has been generated for OpenVPN.</p>'
							},
							{
								xtype  :'button',
								text   :_('Regenerate Server Certificate'),
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
							}
						]
					}
				]
			}
		]
	}

});

/**
 *
 * client certificate list panel - second tab
 *
 */
OMV.Module.Services.OpenVPN.ClientCertsGridPanel = function (config) {

	var initialConfig = {
		disabled         :true,
		hideRefresh      :false,
		hideEdit         :false,
		hideAdd          :true,
		hideDelete       :true,
		hidePagingToolbar:true,
		colModel         :new Ext.grid.ColumnModel({
			columns:[
				{
					header   :_("Common Name"),
					sortable :true,
					dataIndex:"commonname"
				},
				{
					header   :_("Full Name"),
					sortable :true,
					dataIndex:"name"
				},
				{
					header   :_("User"),
					sortable :true,
					dataIndex:"assocuser"
				},
				{
					header   :_("Status"),
					sortable :true,
					dataIndex:"status",
					renderer :function (val, metaData, record) {

						// No val?
						if (!val) {
							return '<span style="color: #f00">Unknown! Could not locate certificate in index.</span>';
						}

						// Revoked
						if (val == 'R') {
							return '<span style="color: #f00">Revoked</span>';
						}

						if (val == 'E' || val == 'V') {

							var myDateStr = Date.parseDate('20' + record.get('expires').substring(0, 10), "YmdHi").format('Y-m-d H:i') + ' UTC';

							switch (val) {
								case 'E':
									return '<span style="color: #f00">Expired ' + myDateStr + '</span>';
								case 'V':
									return 'Valid until ' + myDateStr;

							}
						}
						return '<span style="color: #f00">Unknown status "' + val + '"</span>';
					}
				}
			]
		})
	};
	Ext.apply(initialConfig, config);
	OMV.Module.Services.OpenVPN.ClientCertsGridPanel.superclass.constructor.call(
					this, initialConfig);
};

Ext.extend(OMV.Module.Services.OpenVPN.ClientCertsGridPanel, OMV.grid.TBarGridPanel, {

	id:'OMV.Module.Services.OpenVPN.ClientCertsGridPanel',

	initComponent:function () {
		this.store = new OMV.data.Store({
			autoLoad  :false,
			remoteSort:false,
			proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getCerts"}),
			reader    :new Ext.data.JsonReader({
				idProperty   :"name",
				totalProperty:"total",
				root         :"data",
				fields       :[
					{ name:"commonname" },
					{ name:"name" },
					{ name:"status" },
					{ name:"expires" },
					{ name:'assocuser' },
					{ name:'uuid' }
				]
			}),
			listeners :{
				load :function (s) {
					s.filter('status', new RegExp('^' + Ext.getCmp(this.getId() + '-filter').getValue()), false);
				},
				scope:this
			}
		});
		OMV.Module.Services.OpenVPN.ClientCertsGridPanel.superclass.initComponent.apply(this, arguments);
	},

	// (Re)Load when this tab is shown
	listeners    :{
		show:function () {
			this.doLoad();
		}
	},

	initToolbar         :function () {

		var tbar = OMV.Module.Services.OpenVPN.ClientCertsGridPanel.superclass.initToolbar.apply(this);

		tbar.insert(0, {
			id     :this.getId() + "-new",
			xtype  :"button",
			text   :_("New"),
			icon   :"images/add.png",
			handler:this.cbAddBtnHndl.createDelegate(this)
		});

		tbar.insert(4, {
			id      :this.getId() + "-config",
			xtype   :"button",
			text    :_("Generate Config"),
			icon    :"images/config.png",
			disabled:true,
			handler :this.cbGenBtnHndl.createDelegate(this)
		});

		tbar.insert(5, {
			id      :this.getId() + "-revoke",
			xtype   :"button",
			text    :_("Revoke"),
			icon    :"images/delete.png",
			disabled:true,
			handler :this.cbRevokeBtnHndl.createDelegate(this)
		});

		tbar.insert(10, {xtype:'tbseparator'});
		tbar.insert(21, {xtype:'tbspacer', width:20 });

		tbar.insert(15, {
			xtype:"label",
			text :"Show: "
		})
		tbar.insert(16, {xtype:'tbspacer', width:5 });

		tbar.insert(18, {
			xtype        :"combo",
			id           :this.getId() + '-filter',
			name         :"statusfilter",
			editable     :false,
			width        :200,
			autoWidth    :false,
			triggerAction:"all",
			mode         :"local",
			store        :new Ext.data.SimpleStore({
				fields:[ "value", "text" ],
				data  :[
					[ ".", _("All") ],
					[ "V", _("Valid") ],
					[ "E", _("Expired") ],
					[ "R", _("Revoked") ]
				]
			}),
			displayField :"text",
			valueField   :"value",
			value        :"V",
			listeners    :{
				select:function (s) {
					this.getStore().filter('status', new RegExp('^' + s.getValue()), false);
				},
				scope :this
			}
		});

		return tbar;

	},

	// Add certificate
	cbAddBtnHndl        :function () {

		// Get min, max, and default date strings
		var minDate = new Date();
		minDate.setDate(minDate.getDate() + 1);

		var maxDate = new Date();
		maxDate.setDate(maxDate.getDate() + 3650); // 10 years-ish

		var defDate = new Date();
		defDate.setDate(defDate.getDate() + 1825); // 5 years-ish

		var caWiz = new OMV.Module.Services.OpenVPNWizard({
			title      :_('Client Certificate Wizard'),
			height     :360,
			width      :550,
			method     :'createClientCertificate',
			afterSubmit:function () {
				Ext.getCmp('OMV.Module.Services.OpenVPN.ClientCertsGridPanel').doLoad();
			},
			listeners  :{

				show:function () {

					var pData = Ext.getCmp('OMV.Module.Services.OpenVPN')._data;
					var sData = {};

					for (var i in pData) {
						// Skip common name and use form default
						if (i == 'server-cert-commonname' || i == 'server-cert-email') {
							continue;
						}
						if (i.indexOf('server-cert-') === 0) {
							sData[i.replace('server-cert-', 'client-cert-')] = pData[i];
						}
					}
					this.findByType('form')[0].getForm().setValues(sData);
				}
			},
			steps      :[
				{
					html:'<h1>' + _('Welcome to the Client Certificate Wizard!') + '</h1>' +
									'<p style="margin-top: 10px">' + _('OpenVPN supports bidirectional authentication based on certificates, meaning that the client must authenticate the server certificate and the server must authenticate the client certificate before mutual trust is established.</p><br /><p>This wizard will guide you through creating the OpenVPN client certificate that will be presented to the OpenVPN server for verification.') + '</p>'
				},
				{
					xtype   :'panel',
					layout  :'form',
					defaults:{ border:false },
					items   :[
						{
							html:'<h1>' + _('User Association') + '</h1>' +
											'<p style="margin-top: 10px">' + _('Though not required, client certificates may be associated with an OpenMediaVault user so that they can download their OpenVPN certificate and generated OpenVPN configuration directly from OpenMediaVault.</p><br /><p>If you would like to assiciate this certificate with a particular user, specify the the account below.') + '</p><br /><p> </p>'
						},
						{
							xtype :'panel',
							layout:'fit',
							items :[
								{
									xtype        :'combo',
									name         :'client-cert-assocuser',
									id           :'client-cert-assocuser',
									hiddenName   :'client-cert-assocuser',
									hideLabel    :true,
									valueField   :'name',
									displayField :'name',
									emptyText    :_("Select a user ..."),
									allowBlank   :true,
									allowNone    :true,
									editable     :false,
									autoWidth    :false,
									value        :'',
									triggerAction:"all",
									listeners    :{
										select:function () {

											var pForm = this.findParentByType('form');

											// Set values based on user selection?
											var user = pForm.findById('client-cert-assocuser');
											user = user.getStore().getById(user.getValue());
											if (user && user.get('uuid') != '') {
												pForm.find('name', 'client-cert-commonname')[0].setValue(user.get('name'));
												pForm.find('name', 'client-cert-email')[0].setValue(user.get('email'));
											}
										}
									},
									store        :new OMV.data.Store({
										autoLoad  :true,
										remoteSort:false,
										proxy     :new OMV.data.DataProxy({"service":"UserMgmt", "method":"getUserList"}),
										reader    :new Ext.data.JsonReader({
											idProperty   :"name",
											totalProperty:"total",
											root         :"data",
											fields       :[
												{ name:"name" },
												{ name:"email" }
											]
										}),
										listeners :{
											load:function () {
												this.insert(0, [
													new Ext.data.Record({uuid:'', name:'(none)', email:''})
												]);
											}
										}
									})
								}
							]
						}
					]
				},
				{
					xtype   :'panel',
					defaults:{ border:false },
					items   :[
						{
							html:'<h1>' + _('Client Certificate Configuration') + '</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">' + _('Please enter values below that best describe the new OpenVPN client. These values must be unique within the OpenVPN key store. You may want to include the current date in the certificate\'s Common Name to avoid conflicts.') + '</p>'
						},
						{
							xtype    :'fieldset',
							border   :true,
							title    :_('Client Certificate Details'),
							bodyStyle:'padding:5px',
							style    :'padding-top:0px; padding-bottom: 0px;',
							layout   :'form',
							defaults :{ allowBlank:false, maxLength:64, xtype:'textfield', anchor:'100%' },
							items    :[
								{
									name      :'client-cert-commonname',
									fieldLabel:'Common name',
									value     :'',
									allowBlank:false
								},
								{
									xtype        :'combo',
									name         :'client-cert-country',
									hiddenName   :'client-cert-country',
									fieldLabel   :_('Country'),
									valueField   :'id',
									displayField :'text',
									emptyText    :_("Select a country ..."),
									allowBlank   :false,
									allowNone    :false,
									editable     :false,
									triggerAction:"all",
									store        :new OMV.data.Store({
										remoteSort:false,
										proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getCountries"}),
										reader    :new Ext.data.JsonReader({
											idProperty:"id",
											fields    :[
												{ name:"id" },
												{ name:"text" }
											]
										})
									})
								},
								{
									name      :'client-cert-province',
									fieldLabel:_('Province / State')
								},
								{
									name      :'client-cert-city',
									fieldLabel:_('City')
								},
								{
									name      :'client-cert-org',
									fieldLabel:_('Organization')
								},
								{
									name      :'client-cert-email',
									fieldLabel:_('E-Mail address'),
									vtype     :"email"
								},
								{
									xtype     :'datefield',
									fieldLabel:_('Expires'),
									allowBlank:false,
									width     :'auto',
									autoWidth :true,
									editable  :false,
									name      :'client-cert-date',
									value     :defDate,
									minValue  :minDate,
									maxValue  :maxDate
								}
							]

						}
					]
				},
				{
					xtype    :'panel',
					layout   :'form',
					defaults :{ border:false},
					listeners:{
						show:function (f) {

							// Set labels
							var vals = f.findParentByType('form').getForm().getValues();
							for (var v in vals) {
								var dFields = f.find('name', v + '-label');
								if (dFields[0] && dFields[0].setText) {
									dFields[0].setText(vals[v]);
								}
							}
							// Special cases for combo boxes
							f.find('name', 'client-cert-country-label')[0].setText(
											f.findParentByType('form').find('name', 'client-cert-country')[0]
															.getStore().getById(vals['client-cert-country']).get('text')
							);

							var text = '(none)';
							var user = f.findParentByType('form').find('name', 'client-cert-assocuser')[0].getStore().getById(vals['client-cert-assocuser']);
							if (user) {
								text = user.get('name');
							}
							f.find('name', 'client-cert-assocuser-label')[0].setText(text);

							// Set expire days
							var today = new Date();
							var certDate = new Date(vals['client-cert-date']);

							// Convert to seconds
							today = Math.floor(today.getTime() / 1000);
							certDate = Math.floor(certDate.getTime() / 1000);

							// Strip down to days
							today -= (today % 86400);
							certDate -= (certDate % 86400);

							f.find('name', 'client-cert-expire')[0].setValue(
											String(Math.floor((certDate - today) / 86400))
							);

						}
					},
					items    :[
						{
							html:'<h1>Summary</h1>' +
											'<p style="margin-top: 10px; margin-bottom: 10px">Clicking Finish below ' +
											'will create a client certificate with the following values:</p>'
						},
						{
							xtype    :'fieldset',
							border   :true,
							title    :_('Client Certificate Details'),
							bodyStyle:'padding:5px',
							style    :'padding-top:0px; padding-bottom: 0px;',
							defaults :{ allowBlank:false, xtype:'label'},
							items    :[
								{
									name      :'client-cert-assocuser-label',
									fieldLabel:_('Associated User')
								},
								{
									name      :'client-cert-commonname-label',
									fieldLabel:_('Common name')
								},
								{
									name      :'client-cert-country-label',
									fieldLabel:_('Country')
								},
								{
									name      :'client-cert-province-label',
									fieldLabel:_('Province / State')
								},
								{
									name      :'client-cert-city-label',
									fieldLabel:_('City')
								},
								{
									name      :'client-cert-org-label',
									fieldLabel:_('Organization')
								},
								{
									name      :'client-cert-email-label',
									fieldLabel:_('E-Mail address')
								},
								{
									name      :'client-cert-date-label',
									fieldLabel:_('Expires')
								},
								{
									name :'client-cert-expire',
									xtype:'hidden'
								}
							]


						}
					]
				}
			]

		});

		caWiz.show();

	},

	// Update buttons on selection change
	cbSelectionChangeHdl:function (model) {

		var pWin = this;

		var records = model.getSelections();
		var buttons = ["config", "edit", "revoke"];
		var enableButtons = true;

		// Only one record selected and
		// must be a valid cert
		if (records.length != 1 || records[0].get('status') != 'V') {
			enableButtons = false;
		}

		Ext.each(buttons, function (button) {
			var b = pWin.getTopToolbar().findById(pWin.getId() + "-" + button);
			if (enableButtons) {
				b.enable();
			}
			else {
				b.disable();
			}
		});

	},

	// Edit Certificate entry
	cbEditBtnHdl        :function () {

		var record = this.getSelectionModel().getSelected();

		if (!record || record.get('status') != 'V') {
			return;
		}

		var win = new OMV.CfgObjectDialog({
			title       :_("Edit Client Certificate"),
			uuid        :record.get('uuid'),
			rpcService  :"OpenVPN",
			rpcSetMethod:"setClientCertificate",
			rpcGetMethod:"getClientCertificate",
			width       :500,
			height      :300,
			listeners   :{
				submit:function () {
					this.doReload();
				},
				scope :this
			},
			getFormItems:function () {
				return [
					{
						html:_('<p style="font-style: italic">NOTE: Once a certificate has been generated, it cannot be altered. You may still, however, make changes to the OpenMediaVault user association below.</p><br /><p>Though not required, client certificates may be associated with an OpenMediaVault user so that they can download their OpenVPN certificate and generated OpenVPN configuration directly from OpenMediaVault.</p><br /><p>If you would like to assiciate this certificate with a particular user, specify the the account below.</p><br /><p> </p>')
					},
					{
						xtype        :'combo',
						name         :'client-cert-assocuser',
						id           :'client-cert-assocuser',
						hiddenName   :'client-cert-assocuser',
						hideLabel    :true,
						valueField   :'name',
						displayField :'name',
						emptyText    :_("Select a user ..."),
						allowBlank   :true,
						allowNone    :true,
						width        :400,
						editable     :false,
						value        :'',
						triggerAction:"all",
						store        :new OMV.data.Store({
							autoLoad  :true,
							remoteSort:false,
							proxy     :new OMV.data.DataProxy({"service":"UserMgmt", "method":"getUserList"}),
							reader    :new Ext.data.JsonReader({
								idProperty   :"name",
								totalProperty:"total",
								root         :"data",
								fields       :[
									{ name:"name" }
								]
							}),
							listeners :{
								load:function () {
									this.insert(0, [
										new Ext.data.Record({name:'(none)'})
									]);
								}
							}
						})
					}
				]
			}
		});
		win.show();
	},

	// Generate configuration
	cbGenBtnHndl        :function () {

		var record = this.getSelectionModel().getSelected();
		if (!record || record.get('status') != 'V') {
			return;
		}

		var uuid = record.get('uuid');

		OMV.Module.Services.OpenVPNConfigWizard(uuid);
	},

	// Delete client certificate
	cbRevokeBtnHndl     :function () {

		var records = this.getSelectionModel().getSelections();
		if (records.length != 1) {
			return;
		}
		if (records[0].get('status') != 'V') {
			return;
		}

		Ext.MessageBox.show({
			title  :"Confirmation",
			msg    :_("Are you sure you want to revoke the selected certificate? This action cannot be undone."),
			buttons:Ext.MessageBox.YESNO,
			fn     :function (answer) {
				if (answer == "no") {
					return;
				}

				OMV.MessageBox.wait(null, _("Revoking certificate..."));

				OMV.Ajax.request(function (id, response, error) {

					OMV.MessageBox.updateProgress(1);
					OMV.MessageBox.hide();

					if (error === null) {
						Ext.getCmp('OMV.Module.Services.OpenVPN.ClientCertsGridPanel').doLoad();

						OMV.MessageBox.info(null, _('The certificate has been revoked. If the client to whom this certificate belonged is currently connected, you can wait for the client to renegotiate the SSL/TLS connection (by default once per hour), or restart the OpenVPN server from the Status tab to immediately disconnect the client.'));

					}
					else {
						OMV.MessageBox.error(null, error);
					}

				}, this, "openvpn", "revokeCertificate", {uuid:records[0].get("uuid") });
			},
			scope  :this,
			icon   :Ext.MessageBox.QUESTION
		});
	}

});

OMV.Module.Services.OpenVPN.Status = function (config) {

	var initialConfig = {
		disabled:true,
		layout  :{
			type :'vbox',
			align:'stretch',
			pack :'start'
		},
		defaults:{
			flex      :1,
			viewConfig:{ forceFit:true }
		},
		items   :[
			{
				xtype   :'grid',
				title   :_('Client List'),
				id      :'OMV.Module.Services.OpenVPN.Status-gridclients',
				loadMask:true,
				flex    :1,
				store   :new OMV.data.Store({
					autoLoad  :false,
					remoteSort:false,
					proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getStats"}),
					reader    :new Ext.data.JsonReader({
						totalProperty:"total",
						root         :"clients",
						fields       :[
							{ name:"common-name" },
							{ name:"full-name" },
							{ name:"index" },
							{ name:"status" }
						]
					})
				}),

				columns:[
					{
						header   :_("Common Name"),
						sortable :true,
						dataIndex:"common-name"
					},
					{
						header   :_("Real Address"),
						sortable :true,
						dataIndex:"real-address"
					},
					{
						header   :_("Bytes Received"),
						sortable :true,
						dataIndex:"bytes-received",
						renderer :function (val) {
							val = String(Number(val).binaryConvert('B', 'MiB'));
							if (val.indexOf('.') > 0) {
								val = val.substr(0, val.indexOf('.') + 3);
							}
							return val + ' MiB';
						}
					},
					{
						header   :"Bytes Sent",
						sortable :true,
						dataIndex:"bytes-sent",
						renderer :function (val) {
							val = String(Number(val).binaryConvert('B', 'MiB'));
							if (val.indexOf('.') > 0) {
								val = val.substr(0, val.indexOf('.') + 3);
							}
							return val + ' MiB';
						}

					}
				]
			},
			{
				xtype   :'grid',
				title   :_('Routing Table'),
				id      :'OMV.Module.Services.OpenVPN.Status-gridrouting',
				flex    :1,
				loadMask:true,
				store   :new OMV.data.Store({
					autoLoad  :false,
					remoteSort:false,
					proxy     :null,
					reader    :new Ext.data.JsonReader({
						totalProperty:"total",
						root         :"routing",
						fields       :[
							{ name:"common-name" },
							{ name:"full-name" },
							{ name:"index" },
							{ name:"status" }
						]
					})
				}),

				columns:[
					{
						header   :_("Virtual Address"),
						sortable :true,
						dataIndex:"virtual-address"
					},
					{
						header   :_("Common Name"),
						sortable :true,
						dataIndex:"common-name"
					},
					{
						header   :_("Real Address"),
						sortable :true,
						dataIndex:"real-address"
					}
				]

			}
		]
	};

	Ext.apply(initialConfig, config);
	OMV.Module.Services.OpenVPN.Status.superclass.constructor.call(
					this, initialConfig);
};

Ext.extend(OMV.Module.Services.OpenVPN.Status, Ext.Panel, {

	id:'OMV.Module.Services.OpenVPN.Status',

	initComponent:function () {
		OMV.Module.Services.OpenVPN.Status.superclass.initComponent.apply(this, arguments);
	},

	tbar       :[
		{
			xtype  :"button",
			text   :_("Refresh"),
			icon   :"images/reload.png",
			handler:function (b) {
				b.ownerCt.ownerCt.masterStore.reload();
			}
		},
		{
			xtype:'tbseparator'
		},
		{
			xtype  :"button",
			text   :_("Restart"),
			icon   :"images/run.png",
			handler:function (btn) {
				Ext.MessageBox.show({
					title  :_("Confirmation"),
					msg    :_("Are you sure you want to restart OpenVPN? This will flush all client connections."),
					buttons:Ext.MessageBox.YESNO,
					fn     :function (answer) {
						if (answer == "no") {
							return;
						}

						OMV.MessageBox.wait(null, _("Restarting OpenVPN ..."));

						OMV.Ajax.request(function (id, response, error) {

							OMV.MessageBox.hide();

							if (error) {
								OMV.MessageBox.error(null, error);
							}

							btn.ownerCt.ownerCt.masterStore.reload();

						}, this, "openvpn", "restartOpenVPN");

					},
					scope  :this,
					icon   :Ext.MessageBox.QUESTION
				});
			}
		}
	],

	// There is probably a MUCH better way to do this.
	masterStore:new OMV.data.Store({
		autoLoad  :false,
		remoteSort:false,
		proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getStats"}),
		reader    :new Ext.data.JsonReader({
			totalProperty:"total",
			root         :"stats",
			fields       :[
				{ name:"total" },
				{ name:"rows" }
			]

		}),
		listeners :{
			beforeload:function () {
				Ext.each([Ext.getCmp('OMV.Module.Services.OpenVPN.Status-gridclients').loadMask,
					Ext.getCmp('OMV.Module.Services.OpenVPN.Status-gridrouting').loadMask], function (lm) {
					if (Ext.isObject(lm)) {
						lm.show();
					}
				});
			},

			load:function (s, records) {

				Ext.each([Ext.getCmp('OMV.Module.Services.OpenVPN.Status-gridclients'),
					Ext.getCmp('OMV.Module.Services.OpenVPN.Status-gridrouting')], function (pgrid, a) {

					var cstore = pgrid.getStore();

					cstore.removeAll();
					for (var b = 0; b < records[a]['data']['rows'].length; b++) {
						cstore.add([
							new Ext.data.Record(records[a]['data']['rows'][b])
						]);
					}

					if (Ext.isObject(pgrid.loadMask)) {
						pgrid.loadMask.hide();
					}

				});

			}
		}
	}),

	listeners:{
		show:function (p) {
			p.masterStore.reload();
		}
	}

});

// Register our panels with OMV.NavigationPanelMgr
OMV.NavigationPanelMgr.registerPanel("services", "openvpn", {
	cls     :OMV.Module.Services.OpenVPN,
	position:100,
	title   :_("Settings")
});

OMV.NavigationPanelMgr.registerPanel("services", "openvpn", {
	cls     :OMV.Module.Services.OpenVPN.ClientCertsGridPanel,
	position:200,
	title   :_("Client Certificates")
});

OMV.NavigationPanelMgr.registerPanel("services", "openvpn", {
	cls     :OMV.Module.Services.OpenVPN.Status,
	position:300,
	title   :_("Status")
});

/**
 * @class OMV.Module.Diagnostics.LogPlugin.OpenVPN
 * @derived OMV.Module.Diagnostics.LogPlugin
 * Class that implements the 'OpenVPN' log file diagnostics plugin
 */
OMV.Module.Diagnostics.LogPlugin.OpenVPN = function (config) {
	var initialConfig = {
		title    :_("OpenVPN"),
		stateId  :"c9d06952-00da-11e1-aa29-openvpn",
		columns  :[
			{
				header   :_("Date & Time"),
				sortable :true,
				dataIndex:"date",
				id       :"date",
				width    :20,
				renderer :OMV.util.Format.localeTimeRenderer()
			},
			{
				header   :_("Event"),
				sortable :true,
				dataIndex:"event",
				id       :"event"
			}
		],
		rpcArgs  :{ "id":"openvpn" },
		rpcFields:[
			{ name:"date" },
			{ name:"event" }
		]
	};
	Ext.apply(initialConfig, config);
	OMV.Module.Diagnostics.LogPlugin.OpenVPN.superclass.constructor.call(this, initialConfig);
};
Ext.extend(OMV.Module.Diagnostics.LogPlugin.OpenVPN, OMV.Module.Diagnostics.LogPlugin, {});
OMV.preg("log", "openvpn", OMV.Module.Diagnostics.LogPlugin.OpenVPN);

