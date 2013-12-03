/**
 * vim: tabstop=4
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

Ext.ns("OMV.Module.Services");

//Register the menu.
OMV.NavigationPanelMgr.registerMenu("services", "openvpn", {
	text:_("OpenVPN"),
	icon:"images/openvpn.png"
});

/**
 * @class OMV.Module.Services.OpenVPN
 * @derived OMV.FormPanelExt
 *
 *
 */
OMV.Module.Services.OpenVPN = function (config) {
	var initialConfig = {
		rpcService  :"System",
		rpcGetMethod:"noop",
		hideOK      :true,
		hideReset   :true
	};
	Ext.apply(initialConfig, config);
	OMV.Module.Services.OpenVPN.superclass.constructor.call(this, initialConfig);
};
Ext.extend(OMV.Module.Services.OpenVPN, OMV.FormPanelExt, {

	id   :'OMV.Module.Services.OpenVPN',

	// Hold loaded data for wizard population	
	_data:{},

	initComponent       :function () {

		OMV.Module.Services.OpenVPN.superclass.initComponent.apply(this, arguments);

		// Update form fields
		this.on("load", function (t, r) {

		}, this);
	},

	/* Override reset button. Who cares what the original
	 * form values were.
	 */
	reset               :function () {
		this.doLoad();
	},

	/* Overriden to set labels */
	setValues           :function (values) {
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

	// Generate configuration
	cbGenBtnHndl        :function () {

		var record = Ext.getCmp(this.getId() + '-certgrid').getSelectionModel().getSelected();
		if (!record || record.get('status') != 'V') {
			return;
		}

		var uuid = record.get('uuid');

		OMV.Module.Services.OpenVPNConfigWizard(uuid);
	},

	// Update buttons on selection change
	cbSelectionChangeHdl:function (model) {

		var records = model.getSelections();

		// Only one record selected and
		// must be a valid cert
		var pane = Ext.getCmp(this.getId() + '-certgrid');
		if (records.length != 1 || records[0].get('status') != 'V') {
			pane.getBottomToolbar().findById(this.getId() + '-genconfig').disable();
		}
		else {
			pane.getBottomToolbar().findById(this.getId() + '-genconfig').enable();
		}

	},

	getFormItems:function () {
		return [
			{
				xtype:"fieldset",
				title:_("OpenVPN Client Certificates"),
				items:[
					{
						html:_('OpenVPN client certificates may be associated with your OpenMediaVault account so that you may download them along with a generated OpenVPN configuration file directly from OpenMediaVault\'s interface. Certificates that have been associated with your account by an administrator will appear in the list below. You may select a certificate and click on Generate Configuration to download certificates and generate your OpenVPN configuration file.')
					}
				]
			},
			{
				xtype     :"grid",
				height    :300,
				id        :this.getId() + "-certgrid",
				bbar      :[
					{
						id      :this.getId() + "-genconfig",
						xtype   :"button",
						text    :_("Generate Configuration"),
						icon    :"images/config.png",
						disabled:true,
						handler :this.cbGenBtnHndl.createDelegate(this)
					}
				],
				viewConfig:{ forceFit:true },
				sm        :new Ext.grid.RowSelectionModel({
					singleSelect:true,
					listeners   :{
						selectionchange:this.cbSelectionChangeHdl.createDelegate(this)
					},
					scope       :this
				}),
				store     :new OMV.data.Store({
					autoLoad  :true,
					remoteSort:false,
					proxy     :new OMV.data.DataProxy({"service":"openvpn", "method":"getUserCerts"}),
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
						load:function (s) {
							s.filter('status', 'V');
						}
					}
				}),
				colModel  :new Ext.grid.ColumnModel({
					columns:[
						{
							header   :_("Common Name"),
							sortable :true,
							dataIndex:"commonname"
						},
						{
							header   :"Full Name",
							sortable :true,
							dataIndex:"name"
						},
						{
							header   :_("Expires"),
							sortable :true,
							dataIndex:"expires",
							renderer :function (val, metaData, record) {
								if (record.get('expires')) {
									return Date.parseDate('20' + record.get('expires').substring(0, 10), "YmdHi").format('Y-m-d H:i') + ' UTC';
								}
								else {
									return _('Unknown');
								}
							}
						}
					]
				})
			}
		]
	}
});

// Register our panels with OMV.NavigationPanelMgr
OMV.NavigationPanelMgr.registerPanel("services", "openvpn", {
	cls     :OMV.Module.Services.OpenVPN,
	position:10,
	title   :_("Certificates")
});

