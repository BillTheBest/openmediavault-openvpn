#!/bin/sh

echo "${username}
${password}" | /usr/sbin/pwauth

R="$?"

if [ "$R" != "0" ]; then
	exit $R
fi

## Check for VPN group
groups ${username} | egrep -c '\sopenvpn(\s|$)'

exit $?
