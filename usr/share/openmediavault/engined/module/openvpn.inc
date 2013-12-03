<?php
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

require_once("openmediavault/module.inc");
require_once("openmediavault/config.inc");
require_once("openmediavault/error.inc");
require_once("openmediavault/util.inc");
require_once("openmediavault/initscript.inc");
require_once("openmediavault/log.inc");
require_once(dirname(dirname(__FILE__)) . '/rpc/openvpn.inc');

class OMVModuleOpenVPN extends OMVModuleServiceAbstract
    implements OMVINotifyListener, OMVIModuleStatus {

    /**
     * Get the module name.
     */
    public static function getName() {
        return "openvpn";
    }

    /**
     * Get the module status.
     */
    public function getStatus() {
        global $xmlConfig;

        // Get the configuration object
        $xpath  = OpenVPNRpc::xpathRoot;
        $object = $xmlConfig->get($xpath);
        if (is_null($object)) {
            throw new OMVException(OMVErrorMsg::E_CONFIG_GET_OBJECT_FAILED, $xpath);
        }

        $initd = new OMVSysVInitScript("openvpn");
        return array(
            "name"    => $this->getName(),
            "title"   => gettext("OpenVPN"),
            "enabled" => boolval($object['enable']),
            "running" => ($initd->status() == 0)
        );

    }

    /**
     * Generate CA
     */
    public function generateCa($conf)
    {
        // Generate openvpn-ca
        $cmd = "sudo omv-mkconf openvpn-ca 2>&1";
        OMVUtil::exec($cmd, $output, $result);

        if ($result !== 0) {
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $output));
        }
    }

    /**
     * Generate client cert
     */
    public function generateClientCertificate($conf) {
        global $xmlConfig;

        $xpath = OpenVPNRpc::xpathRoot . "/clients/client[uuid='{$conf['uuid']}']";

        // Generate openvpn-server cert
        $cmd = "sudo omv-mkconf openvpn-cert-client {$conf['uuid']} 2>&1";
        OMVUtil::exec($cmd, $output, $result);
        if ($result !== 0) {
            // remove cert
            $xmlConfig->set($xpath, '');
            $xmlConfig->save();
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $output));
        }

        // Get and populate serial #
        list($null, $serial) = explode('=', array_pop($output));

        if (! $xmlConfig->set($xpath . '/serial', $serial)) {
            throw new OMVException(OMVErrorMsg::E_CONFIG_SET_OBJECT_FAILED);
        }
        $xmlConfig->save();
    }

    /**
     * Generate server cert
     */
    public function generateServerCertificate($conf) {
        // Generate openvpn-server cert
        $cmd = "sudo omv-mkconf openvpn-cert-server 2>&1";
        OMVUtil::exec($cmd, $output, $result);
        if ($result !== 0) {
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $output));
        }
    }

    /**
     * Update the service.
     */
    public function updateService($conf, $oldconf)
    {
        // Create openvpn config file
        $cmd = "sudo omv-mkconf openvpn 2>&1";
        OMVUtil::exec($cmd, $output, $result);
        if ($result !== 0) {
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $output));
        }

        if (! $conf['enable'] && $oldconf['enable']) {
            $initd = new OMVSysVInitScript("openvpn");
            $initd->stop();
        } else if (! $oldconf['enable'] && $conf['enable']) {
            $initd = new OMVSysVInitScript("openvpn");
            $initd->start();

        } else if ($conf['enable']) {  // Determine if it needs to be restarted
            foreach ($conf as $k => $v) {
                if (is_array($v)) {
                    continue;
                }
                if (empty($oldconf[$v])) {
                    $oldconf[$v] = '';
                }
                if (empty($v)) {
                    $v = '';
                }
                if ((string) $v != (string) $oldconf[$v]) {
                    $initd = new OMVSysVInitScript("openvpn");
                    $initd->restart();
                    break;
                }
            }
        }
    }

    /**
     *
     * Bind notification listener
     *
     * @param OMVNotifyDispatcher $dispatcher
     */
    function bindListeners(OMVNotifyDispatcher $dispatcher) {

        $dispatcher->addListener(OMV_NOTIFY_MODIFY,
            "org.openmediavault.services.openvpn",
            array($this, "updateService"), 1);

        $dispatcher->addListener(OMV_NOTIFY_CREATE,
            "org.openmediavault.services.openvpn.ca",
            array($this, "generateCa"), 1);

        $dispatcher->addListener(OMV_NOTIFY_CREATE,
            "org.openmediavault.services.openvpn.server-certificate",
            array($this, "generateServerCertificate"), 1);

        $dispatcher->addListener(OMV_NOTIFY_CREATE,
            "org.openmediavault.services.openvpn.client-certificate",
            array($this, "generateClientCertificate"), 1);
    }
}

// Register module
$moduleMgr = &OMVModuleMgr::getInstance();
$moduleMgr->registerModule(new OMVModuleOpenVPN());

// Register logging
OMVLogFile::registerType("openvpn", array(
    "filename" => "openvpn.log",
    "filepath" => "/var/log/openvpn.log",
    // Nov 29 11:11:26 omv ovpn-omv[26533]: NOTE: t
    "regex"    => "/^(\S+\s+\d+\s+\d+:\d+:\d+) .*?\[\d+\]: (.*)$/",
    "columns"  => array(
        "date"  => array(
            "index" => 1,
            "func"  => create_function('$v', 'return strpdate($v,"M j G:i:s");')
        ),
        "event" => 2
    )
));

?>