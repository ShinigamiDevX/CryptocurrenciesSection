#!/bin/bash

# Check if the user already exists
if elasticsearch-users list | grep "^${KIBANA_USER}"; then
    echo "User ${KIBANA_USER} already exists."
else
    # If the user doesn't exist, create it
    elasticsearch-users useradd ${KIBANA_USER} -p ${KIBANA_PASSWORD} -r superuser,kibana_system
    echo "User ${KIBANA_USER} created."
fi

