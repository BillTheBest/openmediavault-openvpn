#!/bin/bash
#
# Set up nat for VPN connection
#
# @license   http://www.gnu.org/licenses/gpl.html GPL Version 3
# @author    Ian Moore <imooreyahoo@gmail.com>
# @copyright Copyright (c) 2011 Ian Moore
#
# This file is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# any later version.
#
# This file is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this file. If not, see <http://www.gnu.org/licenses/>.

VRUN="/var/run/omv-vpn.${daemon_pid}"

if [ "${script_type}" == "up" ]; then

	IPTBLARG="-I"

	. /etc/default/openmediavault
	. /usr/share/openmediavault/scripts/helper-functions

	# Get OMV config applicable *right* now
	ROUTE=$(omv_config_get "//services/openvpn/vpn-route")
    IP=$(echo "${ROUTE}" | awk '{ print $1 }')
	MASK=$(echo "${ROUTE}" | awk '{ print $NF }')

# Dump current config
cat <<EOF >${VRUN}
ROUTE="${ROUTE}"
IP="${IP}"
MASK="${MASK}"
EOF

	chmod 0600 ${VRUN}

elif [ "${script_type}" = "down" ]; then

	IPTBLARG="-D"

	# this should set $IP and $MASK
	. $VRUN

	# cleanup
	/bin/rm -f ${VRUN}
fi

# If we're routing to a single local server address
# no NAT has to be configured, just exit
if [ "$MASK" = "255.255.255.255" ]; then
	exit 0
# Otherwise, enable ip forwarding
elif [ "${script_type}" = "up" ]; then
	echo 1 >/proc/sys/net/ipv4/ip_forward
fi


if [ "${script_type}" = "up" ] || [ "${script_type}" = "down" ]; then

	# Up to 99 routed networks
    for i in {1..99}
	do
		route_network="route_network_${i}"
		route_netmask="route_netmask_${i}"
		if [ "${!route_network}" = "" ]; then
			break
		fi

        if [ "$ROUTE" = "all" ]; then
            DESTNET=""
        else
            DESTNET="-d ${IP}/${MASK}"
        fi

		# Standard allows
		$(iptables ${IPTBLARG} FORWARD -i tun+ ${DESTNET} -m state --state RELATED,ESTABLISHED -j ACCEPT)
		$(iptables ${IPTBLARG} FORWARD -i tun+ ${DESTNET} -s ${!route_network}/${!route_netmask} -j ACCEPT)
		$(iptables ${IPTBLARG} POSTROUTING -t nat -s ${!route_network}/${!route_netmask} ${DESTNET} -j MASQUERADE)
		

	done
fi


exit 0
