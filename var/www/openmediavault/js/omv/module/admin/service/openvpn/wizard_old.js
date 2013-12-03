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
	// require("js/omv/data/DataRequest.js")

Ext.ns("OMV.Module.Services");

OMV.Module.Services.OpenVPNWizard = function (config) {

	// Track the active card in this wizard
	var activeItem = 0;

	var initialConfig = {
		title      :'Wizard',
		modal      :true,
		afterSubmit:function () {
			// implementing author will override
		},
		layout     :'fit',
		method     :'none',
		width      :500,
		height     :320,
		items      :[
			{
				xtype     :'form',
				itemId    :'wizardform',
				layout    :{
					type          :'card',
					deferredRender:true
				},
				activeItem:0,
				items     :config.steps,
				defaults  :{
					border   :false,
					bodyStyle:'padding: 10px;',
					hideMode :'offsets',
					autoWidth:false,
					anchor   :'100%'
				},
				bbar      :{
					defaults:{ width:75 },
					items   :[
						{
							xtype:'tbfill'
						},
						{
							id      :'card-prev',
							disabled:true,
							itemId  :'prev',
							text    :'&laquo; Previous',
							handler :function (b) {

								b.ownerCt.ownerCt.layout.setActiveItem(--activeItem);

								if (activeItem == 0) {
									b.disable();
								}
								if ((activeItem + 1) != b.ownerCt.ownerCt.items.length) {
									b.ownerCt.getComponent('next').setText('Next &raquo;');
								}
							}
						},
						{
							id     :'card-next',
							text   :'Next &raquo;',
							itemId :'next',
							handler:function (b) {

								var pForm = b.findParentByType('form');

								// Verify form values
								var fields = pForm.layout.activeItem.findByType(Ext.form.Field);
								pForm.getForm().isValid();
								for (var i = 0; i < fields.length; i++) {
									if (!fields[i].isValid()) {
										return;
									}
								}
								// Submit form
								if ((activeItem + 1) == b.ownerCt.ownerCt.items.length) {

									var wzWindow = pForm.ownerCt;

									var onsubmit = function (id, response, error) {
										OMV.MessageBox.updateProgress(1);
										OMV.MessageBox.hide();
										if (error === null) {
											this.afterSubmit(response);
											wzWindow.close();
										}
										else {
											OMV.MessageBox.error(null, error);
										}
									}

									var values = pForm.getForm().getValues();

									// Execute RPC
									if (this.cbSubmitHndl) {
										this.cbSubmitHndl(values, wzWindow);
									}
									else {

										// Display waiting dialog
										OMV.MessageBox.wait(null, "Saving ...");

										OMV.Ajax.request(onsubmit, this, "openvpn", this.method, values);
									}

									return;
								}

								// Go to next card
								pForm.layout.setActiveItem(++activeItem);
								// Clear invalid fields
								Ext.each(pForm.layout.activeItem.findByType(Ext.form.Field), function (f) {
									f.clearInvalid();
								});

								// Set text to finish?
								if ((activeItem + 1) == b.ownerCt.ownerCt.items.length) {
									b.setText('Finish');
								}

								b.ownerCt.getComponent('prev').enable();
							},
							scope  :this
						},
						{
							id     :'card-cancel',
							text   :'Cancel',
							handler:function () {
								this.close();
							},
							scope  :this
						}
					]
				}
			}
		]
	}
	Ext.apply(initialConfig, config);

	OMV.Module.Services.OpenVPNWizard.superclass.constructor.call(this, initialConfig);

}

Ext.extend(OMV.Module.Services.OpenVPNWizard, OMV.Window);

OMV.Module.Services.OpenVPNConfigWizard = function (uuid) {

	var confWiz = new OMV.Module.Services.OpenVPNWizard({
		title       :'OpenVPN Client Configuration Generation Wizard',
		height      :360,
		width       :550,
		cbSubmitHndl:function (values, win) {
			OMV.Download.request("OpenVPN", "generateClientConfig", values);
			win.close();
		},
		steps       :[
			{
				html:'<h1>Welcome to the OpenVPN Client Configuration Generation Wizard!</h1>' +
								'<p style="margin-top: 10px">Some OpenVPN configuration options must match on both the OpenVPN server ' +
								'and the OpenVPN client. While these can be set by manually editing an OpenVPN client configuration file, ' +
								'this wizard will generate the configuration file and include the relevant certificates and keys for you.</p>'
			},
			{
				xtype   :'panel',
				layout  :'form',
				defaults:{ border:false },
				items   :[
					{
						html:'<h1>OpenVPN Client</h1>' +
										'<p style="margin-top: 10px">Select the client operating system below.</p><br /><p> </p>'
					},
					{
						xtype:"hidden",
						name :"uuid",
						value:uuid
					},
					{
						xtype :'fieldset',
						title :'Operating System',
						border:true,
						layout:'fit',
						items :[
							{
								xtype        :"combo",
								name         :"os",
								id           :'OMV.Module.Services.OpenVPNConfigWizard-os',
								hiddenName   :"os",
								hideLabel    :true,
								editable     :false,
								triggerAction:"all",
								autoWidth    :false,
								mode         :"local",
								store        :new Ext.data.ArrayStore({
									fields :[ "value", "text", "download"],
									idIndex:0,
									data   :[

										[ "win", "Windows", "An OpenVPN client for Windows can be downloaded from " +
														"<a target=_blank href='http://openvpn.net/index.php/open-source/downloads.html'>http://openvpn.net/index.php/open-source/downloads.html</a>. " +
														"<br /><br />Once it is instlled, the files provided in the Zip file presented after clicking Finish should be placed in the " +
														"<b>\\Program Files (x86)\\OpenVPN\\config</b> (or \\Program Files\\OpenVPN\\config on 32-bit systems) folder.<br /><br />" +
														"<span style='font-style: italic'>NOTE: The <b>OpenVPN GUI</b> must be run as an account with <b>administrator privileges</b>. " +
														"When launching the OpenVPN GUI program in Windows Vista or higher, it is important to right-click " +
														"on the shortcut and choose " +
														"\"<b>Run as administrator</b>\"</span><br /><br /><a href='http://openvpn.se/files/howto/openvpn-howto_run_openvpn_as_nonadmin.html' target=_blank " +
														">More discussion on OpenVPN + Windows privilege issues.</a>"],

										[ "lin", "Linux (GUI)" , "Most Linux distributions package an OpenVPN client. You should be able to install this using your distribution's" +
														" package management system. On SUSE, CentOS, RedHat and similar platforms, they are called <b>NetworkManager-openvpn-kde</b>, and <b>NetworkManager-openvpn-gnome</b>. " +
														"On Ubuntu / Debian based distributions, they are called <b>network-manager-openvpn-gnome</b>, and  <b>network-manager-openvpn-kde</b>. Install one or the other " +
														"respectively depending on whether you use Gnome or KDE. Ubuntu Unity users should use the -gnome package.<br /><br />Once installed, " +
														"extract the files in the resulting Zip file to a location on the VPN client. You may be able to import the configuration directly by selecting Import in the VPN section " +
														"of Network Configuration and choosing to import the .conf file. This option is not available in KDE, and some versions of Gnome. In these cases, you must set up the VPN " +
														"parameters manually by referencing the <b>manual_config.txt</b> file from the downloaded Zip."],

										[ "osx", "Mac OS X", "While the official OpenVPN web site does not provide an OS X OpenVPN package, " +
														"you may download and use tunnelblick.<br /><br /><ul style='list-style-type:circle;list-style-image:none;'>" +
														"<li>tunnelblick - <a href='http://code.google.com/p/tunnelblick/' target=_blank>http://code.google.com/p/tunnelblick/<a></li>" +
														"</ul><br />Once tunnelblick is installed, the files provided in the Zip file presented after clicking Finish should be placed in the" +
														" <b>~/Library/Application Support/Tunnelblick/Configurations</b> folder.<br /><br />Alternatively, you may import the configuration once " +
														"tunnelblick is running by clicking on the tunnelblick icon in the menu bar and selecting <b>Options</b> -> <b>Add a configuration</b> -> <b>I have " +
														"configuration files</b> -> <b>OpenVPN Configuration(s)</b> -> <b>Open Private Configurations Folder</b>. Drag and drop the extracted files from the " +
														"Zip file into the opened folder and click <b>Done</b>."]
									]
								}),
								listeners    :{
									select:function (sel, record) {
										Ext.getCmp('OMV.Module.Services.OpenVPNConfigWizardDL').update(record.get('download'));
									}
								},
								displayField :"text",
								valueField   :"value",
								allowBlank   :false,
								value        :(Ext.isLinux ? 'lin' : ( Ext.isMac ? 'osx' : 'win' ) )
							}
						]
					},
					{
						id       :'OMV.Module.Services.OpenVPNConfigWizardDL',
						html     :"OpenVPN client can behttp://openvpn.net/index.php/open-source/downloads.html#latest-stable",
						listeners:{
							afterrender:function () {
								var osCombo = Ext.getCmp('OMV.Module.Services.OpenVPNConfigWizard-os');
								Ext.getCmp('OMV.Module.Services.OpenVPNConfigWizardDL').update(
												osCombo.getStore().getById(osCombo.getValue()).get('download')
								);
							}
						}
					}
				]

			}
		]
	});

	confWiz.show();

}