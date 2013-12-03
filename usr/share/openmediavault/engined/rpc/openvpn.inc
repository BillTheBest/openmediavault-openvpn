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

require_once("openmediavault/object.inc");
require_once("openmediavault/error.inc");
require_once("openmediavault/util.inc");
require_once("openmediavault/rpc.inc");
require_once("openmediavault/notify.inc");
require_once("libphp-pclzip/pclzip.lib.php");

class OMVRpcServiceOpenVPN extends OMVRpcServiceAbstract {

    const xpathRoot = '//services/openvpn';
    static $keyDir = '';

/*  Set keydir?
        if (! self::$keyDir) {
            self::$keyDir = $this->configGet(self::xpathRoot . '/keydir');
            if (! self::$keyDir) {
                self::$keyDir = '/etc/openvpn/omv-keys';
            }
        }
*/

    /**
     * Get the RPC service name.
     */
    public function getName() {
        return "OpenVPN";
    }

    /**
     * Initialize the RPC service.
     */
    public function initialize() {
        $this->registerMethod("downloadCert");
        $this->registerMethod("restartOpenVPN");
        $this->registerMethod("generateClientConfig");
        $this->registerMethod("get");
        $this->registerMethod("set");
        $this->registerMethod("getNetworks");
        $this->registerMethod("getClientCertificate");
        $this->registerMethod("setClientCertificate");
        $this->registerMethod("getUserCerts");
        $this->registerMethod("getCerts");
        $this->registerMethod("getCountries");
        $this->registerMethod("getStats");
        $this->registerMethod("createCa");
        $this->registerMethod("createClientCertificate");
        $this->registerMethod("createServerCertificate");
        $this->registerMethod("revokeCertificate");
        $this->registerMethod("xpathConcatEscape");
    }

    /**
     * Download certificate via OMVDownloadRpcServer
     */
    public function downloadCert($cert) {

        if ($cert == 'ca')
            $file = 'ca.crt';
        else
            throw new Exception("Unknown certificate: {$cert}");

        $cmd = sprintf("sudo cat %s/%s", self::$keyDir, $file);
        OMVUtil::exec($cmd, $content);

        return array(
            "contenttype" => 'application/x-x509-ca-cert',
            "filename"    => 'omv-vpn-ca.cert',
            "content"     => implode("\n", $content)
        );
    }

    /**
     * Restart OpenVPN, flushing all clients
     */
    public function restartOpenVPN() {

        // must be admin
        $this->_validate();

        // Stop / Start openvpn
        $initd = new OMVSysVInitScript("openvpn");
        $initd->stop();
        exec("sudo echo ''>/var/log/omvvpn-status.log");
        $initd->start();
    }

    /**
     * Generate and prompt to download client configuration package
     * via OMVDownloadRpcServer
     */
    public function generateClientConfig($params, $context) {
        // Custom validation here
        $this->validateSession();

        // Is the user an admin or the same as the one configured for the cert?
        if (! $this->hasRole(OMV_ROLE_ADMINISTRATOR)) {
            $valid = false;

            $user = $this->configGet(self::xpathRoot . "/clients/client[username='{$params['username']}']/assocuser");
            if ($user) {
                $user = $this->configGet("//system/usermanagement/users/user[name='{$user}']");
                if ($user['name'] == OMVSession::getUsername()) {
                    $valid = true;
                }
            }

            if (! $valid) {
                throw new OMVException(OMVErrorMsg::E_RPC_SERVICE_INVALID_PERMISSION);
            }
        }
        $this->commitSession();

        // Check incoming data
        $this->validateParams(__METHOD__, func_get_args());

        // Generate (semi) safe file name
        $CN = substr(preg_replace('/[^a-z0-9]/i', '_', $this->configGet(self::xpathRoot . "/server-cert-commonname")), 0, 64);

        // Create zip file
        $tmpFile = tempnam(sys_get_temp_dir(), 'pzp');
        $zip     = new PclZip($tmpFile);

        // files to insert
        $inserts = array();

        // SSL file list
        $files = array(
            array(
                'name'   => "{$CN}-ca.crt",
                'source' => 'ca.crt' ),
            array(
                'name'   => "{$CN}-client.crt",
                'source' => $params['uuid'] . '.crt' ),
            array(
                'name'   => "{$CN}-client.key",
                'source' => $params['uuid'] . '.key'
            )
        );

        foreach ($files as $k => $f) {
            $out = array();
            exec("sudo cat " . self::$keyDir . "/{$f['source']}", $out);
            $files[$k] = array(
                PCLZIP_ATT_FILE_NAME    => $f['name'],
                PCLZIP_ATT_FILE_CONTENT => implode("\n", $out)
            );
        }

        // Get global config values to populate client config
        $conf = $this->configGet(self::xpathRoot);

        // Gen config
        $config = "##############################################
# Sample client-side OpenVPN 2.0 config file #
# for connecting to multi-client server.     #
#                                            #
# This configuration can be used by multiple #
# clients, however each client should have   #
# its own cert and key files.                #
#                                            #
# On Windows, you might want to rename this  #
# file so it has a .ovpn extension           #
##############################################

# Specify that we are a client and that we
# will be pulling certain config file directives
# from the server.
client

# server connection params
remote {$conf['publicip']} " .
                            (empty($conf['publicport']) ? $conf['publicport'] : $conf['publicport']) . "
proto {$conf['protocol']}
dev tun

# certs and keys
ca {$CN}-ca.crt
cert {$CN}-client.crt
key {$CN}-client.key
ns-cert-type server

# Authentication and compression settings must
# match on both client and server

# Uncomment to have the VPN client prompt for
# a password. If authentication was not enabled
# at the time this configuration file was
# generated, this setting will be commented out
" . (empty($conf['auth']) ? ';' : '') . "auth-user-pass

# Uncomment to use compression
# If compression was not enabled at the time
# this configuration file was generated, this
# setting will be commented out
" . (empty($conf['compression']) ? ';' : '') . "comp-lzo

# If you are connecting through an
# HTTP proxy to reach the actual OpenVPN
# server, put the proxy server/IP and
# port number here.  See the man page
# if your proxy server requires
# authentication.
;http-proxy-retry # retry on connection failures
;http-proxy [proxy server] [proxy port #]

# Try to preserve some state across restarts.
persist-key
persist-tun

# Most clients don't need to bind to
# a specific local port number.
nobind

# Keep trying indefinitely to resolve the
# host name of the OpenVPN server.  Very useful
# on machines which are not permanently connected
# to the internet such as laptops.
resolv-retry infinite

# Logging verbosity
verb 3

# Silence repeating messages.  At most 20
# sequential messages of the same message
# category will be output to the log.
mute 10
";

        $files['config'] = array(
            PCLZIP_ATT_FILE_NAME    => $CN . ($params['os'] == 'lin' ? '.conf' : '.ovpn'),
            PCLZIP_ATT_FILE_CONTENT => ($params['os'] == 'win' ? str_replace("\n", "\r\n", $config) : $config)
        );

        // Manual configuration instructions / values
        $config = "In some cases, an OpenVPN client must be configured manually and the following
values should be set. Note that it is impossible to know the exact wording a
particular OpenVPN client may use. Some educated guessing may be involved on
your part. If a setting is not listed here, it is either discretionary or
should be left unmodified.

CA or CA certificate: choose the file or path to {$CN}-ca.crt from the
    downloaded zip file.

User or Client certificate: choose the file or path to {$CN}-client.crt
    from the downloaded zip file.

User or Client key: choose the file or path to {$CN}-client.key from the
    downloaded zip file.

Password or passphrase for key: <none>

Gateway or Public address: {$conf['publicip']}
" . (! empty($conf['publicport']) ? "
Port: {$conf['publicport']}" : "") . "
Protocol: {$conf['protocol']}

Authentication or username and password: " .
                            (empty($conf['auth']) ? '<none>' : 'Enter your username and password for OpenMediaValt') . "

Compression or LZO: " . (empty($conf['compression']) ? 'No / None' : 'Yes') . "

";

        $files['mconfig'] = array(
            PCLZIP_ATT_FILE_NAME    => 'manual_config.txt',
            PCLZIP_ATT_FILE_CONTENT => ($params['os'] == 'win' ? str_replace("\n", "\r\n", $config) : $config)
        );

        if (! count($zip->create($files))) {
            throw new Exception("Zip Error: " . $zip->errorInfo(true));
        }

        // Send to download RPC
        $content = file_get_contents($tmpFile);
        unlink($tmpFile);

        return array(
            "contenttype" => 'application/zip',
            "filename"    => $CN . '.zip',
            "content"     => $content
        );
    }

    /**
     * Get all configuration data for service.
     *
     * @return array configuration data
     */
    public function get() {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        //Get configuration object
        $object = $this->configGet(self::xpathRoot);

        // Modify result data
        foreach (array('enable', 'auth', 'compression', 'client-to-client') as $k) {
            $object[$k] = boolval($object[$k]);
        }

        $certVars = array('commonname', 'country', 'province', 'city', 'org', 'email');

        // Check for CA
        $object['ca-exists'] = true;
        foreach ($certVars as $k) {
            if (empty($object['ca-' . $k])) {
                $object['ca-exists'] = false;
                break;
            }
        }

        if ($object['ca-exists']) {
            $out                 = exec('sudo /bin/sh -c \'[ -e ' . self::$keyDir . '/ca.crt ] && echo OK 2>/dev/null\'');
            $object['ca-exists'] = (strpos($out, 'OK') !== false);
        }

        // Check for server cert
        $object['server-cert-exists'] = true;
        foreach ($certVars as $k)
        {
            if (empty($object['server-cert-' . $k]))
            {
                $object['server-cert-exists'] = false;
                break;
            }
        }
        if ($object['server-cert-exists'])
        {
            $out                          = exec('sudo /bin/sh -c \'[ -e ' . self::$keyDir . '/server.crt ] && echo OK 2>/dev/null\'');
            $object['server-cert-exists'] = (strpos($out, 'OK') !== false);
        }

        return $object;
    }

    /**
     * Set configuration data for service.
     *
     * @param $params array configuration data
     */
    public function set($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "enable"            : { "type" : "boolean" },
                "auth"              : { "type" : "boolean" },
                "compression"       : { "type" : "boolean" },
                "protocol"          : { "type" : "string", "enum" : ["tcp", "udp"] },
                "port"              : { "type" : "integer" },
                "publicport"        : { "type" : "string", "optional" : true },
                "publicip"          : { "type" : "string" },
                "extraoptions"      : { "type" : "string", "optional" : true},
                "loglevel"          : { "type" : "string" },
                "vpn-network"       : { "type" : "string" },
                "vpn-mask"          : { "type" : "string" },
                "vpn-route"         : { "type" : "string" },
                "client-to-client"  : { "type" : "boolean" },
                "wins"              : { "type" : "string", "optional" : true },
                "dns"               : { "type" : "string", "optional" : true },
                "dns-domains"       : { "type" : "string", "optional" : true }
            }
        }');

        $oldconf = $this->configGet(self::xpathRoot);
        $object = array_merge($oldconf, $params);

        foreach (array('enable', 'auth', 'compression', 'client-to-client') as $k) {
            $object[$k] = array_boolval($object, $k);
        }

        // Set configuration object
        $this->configReplace(self::xpathRoot, $object);

        $this->configSave();

        // Notify general configuration changes
        $dispatcher = &OMVNotifyDispatcher::getInstance();
        $dispatcher->notify(OMV_NOTIFY_MODIFY, "org.openmediavault.services.openvpn", $object, $oldconf);
    }

    /**
     * Get a list of networks for this machine.
     *
     * @return array networks
     */
    public function getNetworks() {
        $this->_validate();

        $ints = $this->configGetList("//system/network/interfaces/iface");

        $nets     = array();
        $networks = array();

        $base = ip2long('255.255.255.255');
        foreach ($ints as $iface) {
            // If it is DHCP, get from ifconfig
            if ($iface['method'] == 'dhcp') {
                $i     = exec("sudo ifconfig ${iface['devicename']} | grep 'inet addr:'");
                $i     = preg_split('/\s+/', $i);
                $iface = array();

                foreach ($i as $line) {
                    $attrs = explode(' ', trim($line));
                    foreach ($attrs as $a)
                    {
                        if (! strpos($a, ':'))
                        {
                            continue;
                        }
                        list($k, $v) = explode(':', $a);
                        switch ($k)
                        {
                            case 'addr':
                                $iface['address'] = $v;
                                break;
                            case 'Mask':
                                $iface['netmask'] = $v;
                                break;
                        }
                    }
                }
                $iface['method'] = 'dhcp';
            }

            if (empty($iface['address']) || strpos($iface['address'], '127') === 0 || empty($iface['netmask']))
            {
                continue;
            }

            // Single ip if it is a static config in omv
            if ($iface['method'] != 'dhcp')
            {
                $nets[$iface['address'] . " / 255.255.255.255"] = 'Server only (' . $iface['address'] . ')';
            }

            $desc = 'Local network ' . long2ip(ip2long($iface['address']) & ip2long($iface['netmask'])) . "/" . (32 - log((ip2long($iface['netmask']) ^ $base) + 1, 2));

            $netid = long2ip(ip2long($iface['address']) & ip2long($iface['netmask'])) . " / " . $iface['netmask'];
            // Deduplication
            $nets[$netid] = $desc;

        }

        foreach ($nets as $k=> $v)
        {
            $networks[] = array(
                'netid'=> $k, 'text' => $v
            );
        }
        return $networks;
    }

    /**
     * Get a client certificate
     *
     * @param string $uuid the uuid of the certificate to obtain
     *
     * @return array assoc array containing uuid of cert and associated user
     */
    public function getClientCertificate($params, $context) {
        // validate
        $this->_validate(__METHOD__, func_get_args());

        // Only the associated user can be changed, so there
        // is no use in returning anything else
        return array(
            'uuid'                  => $params['uuid'],
            'client-cert-assocuser' => $this->configGet(self::xpathRoot . "/clients/client[uuid='{$params['uuid']}']/assocuser")
        );
    }

    /**
     * Set a client certificate
     *
     * @param array $params array of configuration data to set
     */
    public function setClientCertificate($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "uuid"                  : { ' . $GLOBALS['OMV_JSONSCHEMA_UUID'] . ' },
                "client-cert-assocuser" : { "type" : "string", "optional" : true}
            }
        }');

        if (empty($params['client-cert-assocuser'])) {
            $params['client-cert-assocuser'] = '';
        }

        $this->configReplace(self::xpathRoot . "/clients/client[uuid='{$params['uuid']}']/assocuser",
            $params['client-cert-assocuser']);
        $this->configSave();
    }

    /**
     * Return a list of active leases - passes to $this->getCerts
     *
     * @param $start     integer start point in paging list
     * @param $count     integer number of objects to return in paged list
     * @param $sortField string field to sort on
     * @param $sortDir   integer sort direction
     *
     * @return array list of leases
     */
    public function getUserCerts($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "start"     : { "type" : "integer" },
                "limit"     : { ' . $GLOBALS['OMV_JSONSCHEMA_COUNTFIELD'] . ' },
                "sortfield" : { ' . $GLOBALS['OMV_JSONSCHEMA_SORTFIELD'] . ' },
                "sortdir"   : { ' . $GLOBALS['OMV_JSONSCHEMA_SORTDIR'] . ' }
            }
        }');

        return $this->getCerts($params, true);
    }

    /**
     * Return a list of active leases
     *
     * @param $start     integer start point in paging list
     * @param $count     integer number of objects to return in paged list
     * @param $sortField string field to sort on
     * @param $sortDir   integer sort direction
     *
     * @return array list of leases
     */
    public function getCerts($params, $filterUser = false) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "start"     : { "type" : "integer" },
                "limit"     : { ' . $GLOBALS['OMV_JSONSCHEMA_COUNTFIELD'] . ' },
                "sortfield" : { ' . $GLOBALS['OMV_JSONSCHEMA_SORTFIELD'] . ' },
                "sortdir"   : { ' . $GLOBALS['OMV_JSONSCHEMA_SORTDIR'] . ' }
            }
        }');

        // Is the user an admin or the same as the one configured for the cert?
        if (! $filterUser && ! $this->hasRole(OMV_ROLE_ADMINISTRATOR)) {
            throw new OMVException(OMVErrorMsg::E_RPC_SERVICE_INVALID_PERMISSION);
        }

        $this->commitSession();

        if (! $filterUser) {
            // Check incoming data
            $this->validateParams(__METHOD__, func_get_args());
        }

        $this->commitSession();

        // Key store index values
        $keystore = array();

        $cmd = "sudo cat " . self::$keyDir . "/index.txt 2>&1";
        OMVUtil::exec($cmd, $index, $result);
        if ($result !== 0)
        {
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $index));
        }

        foreach ($index as $line)
        {
            $line = explode("\t", $line, 6);
            if (count($line) < 4)
            {
                continue;
            } // something very wrong..
            $keystore[$line[3]] = array(
                'status'  => $line[0],
                'expires' => $line[1]
            );
        }

        // Filter by current user?
        if ($filterUser) {
            $username = OMVSession::getUsername();
            if ($username)
                $filter = "[assocuser='{$username}']";
            else
                $filter = "[assocuser=NOUSER]";
        } else {
            $filter = '';
        }

        // Configuration objects
        $objects = $this->configGetList(self::xpathRoot . '/clients/client' . $filter);

        // Date for calculation of expiration
        $dateInt = intval(gmdate("ydmHis"));
        foreach (array_keys($objects) as $k) {
            // Check for serial
            if (empty($objects[$k]['serial'])) {
                list($null, $objects[$k]['serial']) = explode('=', exec(sprintf("sudo openssl x509 -noout -in %s/%s.crt -serial", self::$keyDir, $objects[$k]['uuid'])));

                $this->configReplace(self::xpathRoot . "/clients/client[uuid='{$objects[$k]['uuid']}']", $objects[$k]);
                $this->configSave();
            }

            // Translate user
            $user = '';
            if ($objects[$k]['assocuser']) {
                try {
                    $user = $this->configGet("//system/usermanagement/users/user[name='{$objects[$k]['assocuser']}']");
                    $user = $user['name'];
                } catch (Exception $e) {
                    $user = '';
                }
            }
            $objects[$k]['assocuser'] = $user;

            // Enrich with key store values
            if (! empty($keystore[$objects[$k]['serial']])) {
                $objects[$k] = array_merge($objects[$k], $keystore[$objects[$k]['serial']]);
            }

            // Not found in keystore
            if (empty($objects[$k]['status'])) {
                $objects[$k]['status'] = 'Not found in keystore index!';
            }
            else if ($objects[$k]['status'] == 'V' &&
                             intval(substr($objects[$k]['expires'], 0, 12)) < $dateInt
            )
            {
                $objects[$k]['status'] = 'E';
            }
        }

        // Filter result
        return $this->applyFilter($objects, $params['start'], $params['limit'], $params['sortfield'], $params['sortdir']);
    }

    /**
     * Return a list of valid countries for certs
     *
     * @return array list of countires
     */
    public function getCountries() {
        return array(
            array( 'id' => 'AF', 'text' => 'AFGHANISTAN (AF)' ),
            array( 'id' => 'AL', 'text' => 'ALBANIA (AL)' ),
            array( 'id' => 'DZ', 'text' => 'ALGERIA (DZ)' ),
            array( 'id' => 'AS', 'text' => 'AMERICAN SAMOA (AS)' ),
            array( 'id' => 'AD', 'text' => 'ANDORRA (AD)' ),
            array( 'id' => 'AO', 'text' => 'ANGOLA (AO)' ),
            array( 'id' => 'AI', 'text' => 'ANGUILLA (AI)' ),
            array( 'id' => 'AQ', 'text' => 'ANTARCTICA (AQ)' ),
            array( 'id' => 'AG', 'text' => 'ANTIGUA AND BARBUDA (AG)' ),
            array( 'id' => 'AR', 'text' => 'ARGENTINA (AR)' ),
            array( 'id' => 'AM', 'text' => 'ARMENIA (AM)' ),
            array( 'id' => 'AW', 'text' => 'ARUBA (AW)' ),
            array( 'id' => 'AU', 'text' => 'AUSTRALIA (AU)' ),
            array( 'id' => 'AT', 'text' => 'AUSTRIA (AT)' ),
            array( 'id' => 'AZ', 'text' => 'AZERBAIJAN (AZ)' ),
            array( 'id' => 'BS', 'text' => 'BAHAMAS (BS)'   ),
            array( 'id' => 'BH', 'text' => 'BAHRAIN (BH)'   ),
            array( 'id' => 'BD', 'text' => 'BANGLADESH (BD)' ),
            array( 'id' => 'BB', 'text' => 'BARBADOS (BB)' ),
            array( 'id' => 'BY', 'text' => 'BELARUS (BY)'   ),
            array( 'id' => 'BE', 'text' => 'BELGIUM (BE)' ),
            array( 'id' => 'BZ', 'text' => 'BELIZE (BZ)' ),
            array( 'id' => 'BJ', 'text' => 'BENIN (BJ)' ),
            array( 'id' => 'BM', 'text' => 'BERMUDA (BM)'   ),
            array( 'id' => 'BT', 'text' => 'BHUTAN (BT)' ),
            array( 'id' => 'BO', 'text' => 'BOLIVIA (BO)' ),
            array( 'id' => 'BA', 'text' => 'BOSNIA AND HERZEGOVINA (BA)' ),
            array( 'id' => 'BW', 'text' => 'BOTSWANA (BW)' ),
            array( 'id' => 'BV', 'text' => 'BOUVET ISLAND (BV)' ),
            array( 'id' => 'BR', 'text' => 'BRAZIL (BR)' ),
            array( 'id' => 'IO', 'text' => 'BRITISH INDIAN OCEAN TERRITORY (IO)' ),
            array( 'id' => 'BN', 'text' => 'BRUNEI DARUSSALAM (BN)' ),
            array( 'id' => 'BG', 'text' => 'BULGARIA (BG)' ),
            array( 'id' => 'BF', 'text' => 'BURKINA FASO (BF)' ),
            array( 'id' => 'BI', 'text' => 'BURUNDI (BI)' ),
            array( 'id' => 'KH', 'text' => 'CAMBODIA (KH)' ),
            array( 'id' => 'CM', 'text' => 'CAMEROON (CM)' ),
            array( 'id' => 'CA', 'text' => 'CANADA (CA)' ),
            array( 'id' => 'CV', 'text' => 'CAPE VERDE (CV)' ),
            array( 'id' => 'KY', 'text' => 'CAYMAN ISLANDS (KY)' ),
            array( 'id' => 'CF', 'text' => 'CENTRAL AFRICAN REPUBLIC (CF)' ),
            array( 'id' => 'TD', 'text' => 'CHAD (TD)' ),
            array( 'id' => 'CL', 'text' => 'CHILE (CL)' ),
            array( 'id' => 'CN', 'text' => 'CHINA (CN)' ),
            array( 'id' => 'CX', 'text' => 'CHRISTMAS ISLAND (CX)' ),
            array( 'id' => 'CC', 'text' => 'COCOS (KEELING) ISLANDS (CC)' ),
            array( 'id' => 'CO', 'text' => 'COLOMBIA (CO)' ),
            array( 'id' => 'KM', 'text' => 'COMOROS (KM)' ),
            array( 'id' => 'CG', 'text' => 'CONGO (CG)' ),
            array( 'id' => 'CD', 'text' => 'CONGO, THE DEMOCRATIC REPUBLIC OF THE (CD)' ),
            array( 'id' => 'CK', 'text' => 'COOK ISLANDS (CK)' ),
            array( 'id' => 'CR', 'text' => 'COSTA RICA (CR)' ),
            array( 'id' => 'CI', 'text' => 'CTE D\'IVOIRE (CI)' ),
            array( 'id' => 'HR', 'text' => 'CROATIA (HR)' ),
            array( 'id' => 'CY', 'text' => 'CYPRUS (CY)' ),
            array( 'id' => 'CZ', 'text' => 'CZECH REPUBLIC (CZ)' ),
            array( 'id' => 'DK', 'text' => 'DENMARK (DK)' ),
            array( 'id' => 'DJ', 'text' => 'DJIBOUTI (DJ)' ),
            array( 'id' => 'DM', 'text' => 'DOMINICA (DM)' ),
            array( 'id' => 'DO', 'text' => 'DOMINICAN REPUBLIC (DO)' ),
            array( 'id' => 'EC', 'text' => 'ECUADOR (EC)' ),
            array( 'id' => 'EG', 'text' => 'EGYPT (EG)' ),
            array( 'id' => 'SV', 'text' => 'EL SALVADOR (SV)' ),
            array( 'id' => 'GQ', 'text' => 'EQUATORIAL GUINEA (GQ)' ),
            array( 'id' => 'ER', 'text' => 'ERITREA (ER)' ),
            array( 'id' => 'EE', 'text' => 'ESTONIA (EE)' ),
            array( 'id' => 'ET', 'text' => 'ETHIOPIA (ET)' ),
            array( 'id' => 'FK', 'text' => 'FALKLAND ISLANDS (MALVINAS) (FK)' ),
            array( 'id' => 'FO', 'text' => 'FAROE ISLANDS (FO)' ),
            array( 'id' => 'FJ', 'text' => 'FIJI (FJ)' ),
            array( 'id' => 'FI', 'text' => 'FINLAND (FI)' ),
            array( 'id' => 'FR', 'text' => 'FRANCE (FR)' ),
            array( 'id' => 'GF', 'text' => 'FRENCH GUIANA (GF)' ),
            array( 'id' => 'PF', 'text' => 'FRENCH POLYNESIA (PF)' ),
            array( 'id' => 'TF', 'text' => 'FRENCH SOUTHERN TERRITORIES (TF)' ),
            array( 'id' => 'GA', 'text' => 'GABON (GA)' ),
            array( 'id' => 'GM', 'text' => 'GAMBIA (GM)' ),
            array( 'id' => 'GE', 'text' => 'GEORGIA (GE)' ),
            array( 'id' => 'DE', 'text' => 'GERMANY (DE)' ),
            array( 'id' => 'GH', 'text' => 'GHANA (GH)' ),
            array( 'id' => 'GI', 'text' => 'GIBRALTAR (GI)' ),
            array( 'id' => 'GR', 'text' => 'GREECE (GR)' ),
            array( 'id' => 'GL', 'text' => 'GREENLAND (GL)' ),
            array( 'id' => 'GD', 'text' => 'GRENADA (GD)' ),
            array( 'id' => 'GP', 'text' => 'GUADELOUPE (GP)' ),
            array( 'id' => 'GT', 'text' => 'GUATEMALA (GT)' ),
            array( 'id' => 'GN', 'text' => 'GUINEA (GN)' ),
            array( 'id' => 'GW', 'text' => 'GUINEA-BISSAU (GW)' ),
            array( 'id' => 'GY', 'text' => 'GUYANA (GY)' ),
            array( 'id' => 'HT', 'text' => 'HAITI (HT)' ),
            array( 'id' => 'HM', 'text' => 'HEARD ISLAND AND MCDONALD ISLANDS (HM)' ),
            array( 'id' => 'VA', 'text' => 'HOLY SEE (VATICAN CITY STATE) (VA)' ),
            array( 'id' => 'HN', 'text' => 'HONDURAS (HN)' ),
            array( 'id' => 'HK', 'text' => 'HONG KONG (HK)' ),
            array( 'id' => 'HU', 'text' => 'HUNGARY (HU)' ),
            array( 'id' => 'IS', 'text' => 'ICELAND (IS)' ),
            array( 'id' => 'IN', 'text' => 'INDIA (IN)' ),
            array( 'id' => 'ID', 'text' => 'INDONESIA (ID)' ),
            array( 'id' => 'IE', 'text' => 'IRELAND (IE)' ),
            array( 'id' => 'IL', 'text' => 'ISRAEL (IL)' ),
            array( 'id' => 'IT', 'text' => 'ITALY (IT)' ),
            array( 'id' => 'JM', 'text' => 'JAMAICA (JM)' ),
            array( 'id' => 'JP', 'text' => 'JAPAN (JP)' ),
            array( 'id' => 'JO', 'text' => 'JORDAN (JO)' ),
            array( 'id' => 'KZ', 'text' => 'KAZAKHSTAN (KZ)' ),
            array( 'id' => 'KE', 'text' => 'KENYA (KE)' ),
            array( 'id' => 'KI', 'text' => 'KIRIBATI (KI)' ),
            array( 'id' => 'KR', 'text' => 'KOREA, REPUBLIC OF (KR)' ),
            array( 'id' => 'KW', 'text' => 'KUWAIT (KW)' ),
            array( 'id' => 'KG', 'text' => 'KYRGYZSTAN (KG)' ),
            array( 'id' => 'LA', 'text' => 'LAO PEOPLE\'S DEMOCRATIC REPUBLIC (LA)' ),
            array( 'id' => 'LV', 'text' => 'LATVIA (LV)' ),
            array( 'id' => 'LB', 'text' => 'LEBANON (LB)' ),
            array( 'id' => 'LS', 'text' => 'LESOTHO (LS)' ),
            array( 'id' => 'LR', 'text' => 'LIBERIA (LR)' ),
            array( 'id' => 'LI', 'text' => 'LIECHTENSTEIN (LI)' ),
            array( 'id' => 'LT', 'text' => 'LITHUANIA (LT)' ),
            array( 'id' => 'LU', 'text' => 'LUXEMBOURG (LU)' ),
            array( 'id' => 'MO', 'text' => 'MACAO (MO)' ),
            array( 'id' => 'MK', 'text' => 'MACEDONIA, THE FORMER YUGOSLAV REPUBLIC OF (MK)' ),
            array( 'id' => 'MG', 'text' => 'MADAGASCAR (MG)' ),
            array( 'id' => 'MW', 'text' => 'MALAWI (MW)' ),
            array( 'id' => 'MY', 'text' => 'MALAYSIA (MY)' ),
            array( 'id' => 'MV', 'text' => 'MALDIVES (MV)' ),
            array( 'id' => 'ML', 'text' => 'MALI (ML)' ),
            array( 'id' => 'MT', 'text' => 'MALTA (MT)' ),
            array( 'id' => 'MH', 'text' => 'MARSHALL ISLANDS (MH)' ),
            array( 'id' => 'MQ', 'text' => 'MARTINIQUE (MQ)' ),
            array( 'id' => 'MR', 'text' => 'MAURITANIA (MR)' ),
            array( 'id' => 'MU', 'text' => 'MAURITIUS (MU)' ),
            array( 'id' => 'YT', 'text' => 'MAYOTTE (YT)' ),
            array( 'id' => 'MX', 'text' => 'MEXICO (MX)' ),
            array( 'id' => 'FM', 'text' => 'MICRONESIA, FEDERATED STATES OF (FM)' ),
            array( 'id' => 'MD', 'text' => 'MOLDOVA, REPUBLIC OF (MD)' ),
            array( 'id' => 'MC', 'text' => 'MONACO (MC)' ),
            array( 'id' => 'MN', 'text' => 'MONGOLIA (MN)' ),
            array( 'id' => 'ME', 'text' => 'MONTENEGRO (ME)' ),
            array( 'id' => 'MS', 'text' => 'MONTSERRAT (MS)' ),
            array( 'id' => 'MA', 'text' => 'MOROCCO (MA)' ),
            array( 'id' => 'MZ', 'text' => 'MOZAMBIQUE (MZ)' ),
            array( 'id' => 'MM', 'text' => 'MYANMAR (MM)' ),
            array( 'id' => 'NA', 'text' => 'NAMIBIA (NA)' ),
            array( 'id' => 'NR', 'text' => 'NAURU (NR)' ),
            array( 'id' => 'NP', 'text' => 'NEPAL (NP)' ),
            array( 'id' => 'NL', 'text' => 'NETHERLANDS (NL)' ),
            array( 'id' => 'AN', 'text' => 'NETHERLANDS ANTILLES (AN)' ),
            array( 'id' => 'NC', 'text' => 'NEW CALEDONIA (NC)' ),
            array( 'id' => 'NZ', 'text' => 'NEW ZEALAND (NZ)' ),
            array( 'id' => 'NI', 'text' => 'NICARAGUA (NI)' ),
            array( 'id' => 'NE', 'text' => 'NIGER (NE)' ),
            array( 'id' => 'NG', 'text' => 'NIGERIA (NG)' ),
            array( 'id' => 'NU', 'text' => 'NIUE (NU)' ),
            array( 'id' => 'NF', 'text' => 'NORFOLK ISLAND (NF)' ),
            array( 'id' => 'MP', 'text' => 'NORTHERN MARIANA ISLANDS (MP)' ),
            array( 'id' => 'NO', 'text' => 'NORWAY (NO)' ),
            array( 'id' => 'OM', 'text' => 'OMAN (OM)' ),
            array( 'id' => 'PK', 'text' => 'PAKISTAN (PK)' ),
            array( 'id' => 'PW', 'text' => 'PALAU (PW)' ),
            array( 'id' => 'PS', 'text' => 'PALESTINIAN TERRITORY, OCCUPIED (PS)' ),
            array( 'id' => 'PA', 'text' => 'PANAMA (PA)' ),
            array( 'id' => 'PG', 'text' => 'PAPUA NEW GUINEA (PG)' ),
            array( 'id' => 'PY', 'text' => 'PARAGUAY (PY)' ),
            array( 'id' => 'PE', 'text' => 'PERU (PE)' ),
            array( 'id' => 'PH', 'text' => 'PHILIPPINES (PH)' ),
            array( 'id' => 'PN', 'text' => 'PITCAIRN (PN)' ),
            array( 'id' => 'PL', 'text' => 'POLAND (PL)' ),
            array( 'id' => 'PT', 'text' => 'PORTUGAL (PT)' ),
            array( 'id' => 'PR', 'text' => 'PUERTO RICO (PR)' ),
            array( 'id' => 'QA', 'text' => 'QATAR (QA)' ),
            array( 'id' => 'RE', 'text' => 'RUNION (RE)' ),
            array( 'id' => 'RO', 'text' => 'ROMANIA (RO)' ),
            array( 'id' => 'RU', 'text' => 'RUSSIAN FEDERATION (RU)' ),
            array( 'id' => 'RW', 'text' => 'RWANDA (RW)' ),
            array( 'id' => 'SH', 'text' => 'SAINT HELENA (SH)' ),
            array( 'id' => 'KN', 'text' => 'SAINT KITTS AND NEVIS (KN)' ),
            array( 'id' => 'LC', 'text' => 'SAINT LUCIA (LC)' ),
            array( 'id' => 'PM', 'text' => 'SAINT PIERRE AND MIQUELON (PM)' ),
            array( 'id' => 'VC', 'text' => 'SAINT VINCENT AND THE GRENADINES (VC)' ),
            array( 'id' => 'WS', 'text' => 'SAMOA (WS)' ),
            array( 'id' => 'SM', 'text' => 'SAN MARINO (SM)' ),
            array( 'id' => 'ST', 'text' => 'SAO TOME AND PRINCIPE (ST)' ),
            array( 'id' => 'SA', 'text' => 'SAUDI ARABIA (SA)' ),
            array( 'id' => 'SN', 'text' => 'SENEGAL (SN)' ),
            array( 'id' => 'RS', 'text' => 'SERBIA (RS)' ),
            array( 'id' => 'SC', 'text' => 'SEYCHELLES (SC)' ),
            array( 'id' => 'SL', 'text' => 'SIERRA LEONE (SL)' ),
            array( 'id' => 'SG', 'text' => 'SINGAPORE (SG)' ),
            array( 'id' => 'SK', 'text' => 'SLOVAKIA (SK)' ),
            array( 'id' => 'SI', 'text' => 'SLOVENIA (SI)' ),
            array( 'id' => 'SB', 'text' => 'SOLOMON ISLANDS (SB)' ),
            array( 'id' => 'SO', 'text' => 'SOMALIA (SO)' ),
            array( 'id' => 'ZA', 'text' => 'SOUTH AFRICA (ZA)' ),
            array( 'id' => 'GS', 'text' => 'SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS (GS)' ),
            array( 'id' => 'ES', 'text' => 'SPAIN (ES)' ),
            array( 'id' => 'LK', 'text' => 'SRI LANKA (LK)' ),
            array( 'id' => 'SR', 'text' => 'SURINAME (SR)' ),
            array( 'id' => 'SJ', 'text' => 'SVALBARD AND JAN MAYEN (SJ)' ),
            array( 'id' => 'SZ', 'text' => 'SWAZILAND (SZ)' ),
            array( 'id' => 'SE', 'text' => 'SWEDEN (SE)' ),
            array( 'id' => 'CH', 'text' => 'SWITZERLAND (CH)' ),
            array( 'id' => 'TW', 'text' => 'TAIWAN (TW)' ),
            array( 'id' => 'TJ', 'text' => 'TAJIKISTAN (TJ)' ),
            array( 'id' => 'TZ', 'text' => 'TANZANIA, UNITED REPUBLIC OF (TZ)' ),
            array( 'id' => 'TH', 'text' => 'THAILAND (TH)' ),
            array( 'id' => 'TG', 'text' => 'TOGO (TG)' ),
            array( 'id' => 'TK', 'text' => 'TOKELAU (TK)' ),
            array( 'id' => 'TO', 'text' => 'TONGA (TO)' ),
            array( 'id' => 'TT', 'text' => 'TRINIDAD AND TOBAGO (TT)' ),
            array( 'id' => 'TN', 'text' => 'TUNISIA (TN)' ),
            array( 'id' => 'TR', 'text' => 'TURKEY (TR)' ),
            array( 'id' => 'TM', 'text' => 'TURKMENISTAN (TM)' ),
            array( 'id' => 'TC', 'text' => 'TURKS AND CAICOS ISLANDS (TC)' ),
            array( 'id' => 'TV', 'text' => 'TUVALU (TV)' ),
            array( 'id' => 'UG', 'text' => 'UGANDA (UG)' ),
            array( 'id' => 'UA', 'text' => 'UKRAINE (UA)' ),
            array( 'id' => 'AE', 'text' => 'UNITED ARAB EMIRATES (AE)' ),
            array( 'id' => 'GB', 'text' => 'UNITED KINGDOM (GB)' ),
            array( 'id' => 'US', 'text' => 'UNITED STATES (US)' ),
            array( 'id' => 'UM', 'text' => 'UNITED STATES MINOR OUTLYING ISLANDS (UM)' ),
            array( 'id' => 'UY', 'text' => 'URUGUAY (UY)' ),
            array( 'id' => 'UZ', 'text' => 'UZBEKISTAN (UZ)' ),
            array( 'id' => 'VU', 'text' => 'VANUATU (VU)' ),
            array( 'id' => 'VE', 'text' => 'VENEZUELA (VE)' ),
            array( 'id' => 'VN', 'text' => 'VIET NAM (VN)' ),
            array( 'id' => 'VG', 'text' => 'VIRGIN ISLANDS, BRITISH (VG)' ),
            array( 'id' => 'VI', 'text' => 'VIRGIN ISLANDS, U.S. (VI)' ),
            array( 'id' => 'WF', 'text' => 'WALLIS AND FUTUNA (WF)' ),
            array( 'id' => 'EH', 'text' => 'WESTERN SAHARA (EH)' ),
            array( 'id' => 'YE', 'text' => 'YEMEN (YE)' ),
            array( 'id' => 'ZM', 'text' => 'ZAMBIA (ZM)' ),
            array( 'id' => 'ZW', 'text' => 'ZIMBABWE (ZW)')
        );
    }

    /**
     *
     * Returns a list of active leases used for combo box population
     * when adding a reservation
     *
     * @return array list of leases
     */
    public function getStats() {
        $this->_validate();

        $statTables = array(
            'OpenVPN CLIENT LIST' => array(
                'headers'    => 2,
                'name'       => 'clients',
                'stat-names' => array(
                ),
                'stats'      => array()
            ),
            'ROUTING TABLE'       => array(
                'headers'    => 1,
                'name'       => 'routing',
                'stat-names' => array(
                ),
                'stats'      => array()
            ),
            'GLOBAL STATS'        => array(
                'headers' => 1,
                'name'    => 'global',
                'stats'   => array()
            )
        );
        $tableIndex = '';
        exec('sudo cat /var/log/omvvpn-status.log', $out);

        foreach ($out as $o) {
            // End of stats?
            if ($o == 'END')
                break;

            // Search for index
            if (! empty($statTables[$o])) {
                $tableIndex = $o;
                continue;
            }

            // Skip headers
            if ($tableIndex && $statTables[$tableIndex]['headers'] > 0) {
                if ($statTables[$tableIndex]['headers'] -- == 1) {
                    foreach (explode(',', $o) as $k) {
                        $statTables[$tableIndex]['stat-names'][] = strtolower(str_replace(' ', '-', $k));
                    }
                }
                continue;
            }

            // Add to stats
            if ($tableIndex) {
                $statTables[$tableIndex]['stats'][] = explode(',', $o);
            }
        }

        // Create output object
        $objects = array();
        foreach ($statTables as $s) {
            $objects[] = array(
                'rows'  => array_map(function($row) use ($s)
                {
                    return array_combine($s['stat-names'], $row);
                }, $s['stats']),
                'total' => count($s['stats'])
            );
        }

        return array(
            'total'=> count($objects),
            'stats'=> $objects
        );
    }

    /**
     * Set configuration values for CA and notify listeners
     *
     * @param array $params array of CA configuration settings
     */
    public function createCa($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "ca-country"    : { "type" : "string", "format" : "regex", "pattern" : "/[A-Z]{2}/" },
                "ca-commonname" : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "ca-province"   : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "ca-city"       : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "ca-org"        : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "ca-email"      : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "mntentref"     : { ' . $GLOBALS['OMV_JSONSCHEMA_UUID'] . ' }
            }
        }');

        // Set keystore data root
        $params['keydir'] = $this->configGet(sprintf("//system/fstab/mntent[uuid='%s']", $params['mntentref']));
        $params['keydir'] = $params['keydir']['dir'] . '/openvpn-keystore';

        $object = array_merge($this->configGet(self::xpathRoot), $params);

        // Set configuration object
        $this->configReplace(self::xpathRoot, $object);
        $this->configSave();

        // Notify general configuration changes
        $dispatcher = &OMVNotifyDispatcher::getInstance();
        $dispatcher->notify(OMV_NOTIFY_CREATE, "org.openmediavault.services.openvpn.ca", $object);
    }

    /**
     * Set configuration values for CA and notify listeners
     *
     * @param array $params array of CA configuration settings
     */
    public function createClientCertificate($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "client-cert-country"    : { "type" : "string", "format" : "regex", "pattern" : "/[A-Z]{2}/" },
                "client-cert-commonname" : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "client-cert-province"   : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "client-cert-city"       : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "client-cert-org"        : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "client-cert-email"      : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "client-cert-assocuser"  : { "type" : "string", "optional" : true },
                "client-cert-expire"     : { "type" : "string", "format" : "regex", "pattern" : "/^[0-9]+$/" },                "client-cert-date"       : { "type" : "string" }
            }
        }');

        // strip off cert-date
        unset($params['client-cert-date']);

        $object = array('uuid'=> OMVUtil::uuid());
        foreach (array_keys($params) as $k) {
            $object[str_replace('client-cert-', '', $k)] = $params[$k];
        }
        $object['name']   = "/C={$object['country']}/ST={$object['province']}/L={$object['city']}/O={$object['org']}/CN={$object['commonname']}/emailAddress={$object['email']}";
        $object['serial'] = '';

        // Check for uniqeness
        if ($xmlConfig->exists(sprintf(self::xpathRoot . "/clients/client[name=%s]", $this->xpathConcatEscape($object['name'])))) {
            throw new OMVException(OMVErrorMsg::E_CONFIG_OBJECT_UNIQUENESS);
        }

        // Append object to configuration
        $this->configSet(self::xpathRoot . "/clients", array("client" => $object));
        $this->configSave();

        // Notify general configuration changes
        $dispatcher = &OMVNotifyDispatcher::getInstance();
        $dispatcher->notify(OMV_NOTIFY_CREATE, "org.openmediavault.services.openvpn.client-certificate", $object);
    }

    /**
     * Set configuration values for Server Certificate and notify listeners
     *
     * @param array $params array of server certificate configuration settings
     */
    public function createServerCertificate($params, $context) {
        global $xmlConfig;

        // Validate the RPC caller context.
        $this->validateMethodContext($context, array( "role" => OMV_ROLE_ADMINISTRATOR ));

        // Validate the parameters of the RPC service method.
        $this->validateMethodParams($params, '{
            "type"       : "object",
            "properties" : {
                "server-cert-country"    : { "type" : "string", "format" : "regex", "pattern" : "/[A-Z]{2}/" },
                "server-cert-commonname" : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "server-cert-province"   : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "server-cert-city"       : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "server-cert-org"        : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" },
                "server-cert-email"      : { "type" : "string", "format" : "regex", "pattern" : "/^.{1,64}$/" }
            }
        }');

        $object = array_merge($this->configGet(self::xpathRoot), $params);

        // Set configuration object
        $this->configReplace(self::xpathRoot, $object);
        $this->configSave();

        // Notify general configuration changes
        $dispatcher = &OMVNotifyDispatcher::getInstance();
        $dispatcher->notify(OMV_NOTIFY_CREATE, "org.openmediavault.services.openvpn.server-certificate", $object);
    }

    /**
     * Revoke a client certificate
     */
    public function revokeCertificate($uuid) {
        $this->_validate(__METHOD__, func_get_args());

        // Call openvpn script
        $cmd = "sudo omv-mkconf openvpn-cert-revoke {$uuid} 2>&1";
        OMVUtil::exec($cmd, $output, $result);
        if ($result !== 0) {
            throw new OMVException(OMVErrorMsg::E_EXEC_FAILED, $cmd, implode("\n", $output));
        }
    }

    /**
     * And this is why I dislike xpath. This should be simple enough,
     * but is not...
     * Escape any character by using XPATH's concat()
     *
     * @param string $string the string to escape
     *
     * @return string a 'concat' function string for use in xpath
     */
    public function xpathConcatEscape($string) {
        if (strpos($string, "'") === false)
            return "'{$string}'";

        return "concat(" . str_replace(array("'',", ",''"), "", "'" . implode("',\"'\",'", explode("'", $string)) . "'") . ")";
    }
}

// Register the RPC service.
$rpcServiceMgr = &OMVRpcServiceMgr::getInstance();
$rpcServiceMgr->registerService(new OMVRpcServiceOpenVPN());

?>