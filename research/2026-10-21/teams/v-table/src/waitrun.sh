#!/bin/bash
# wait for a marker file, then run a chain
until [ -e "$1" ]; do sleep 5; done; bash "$2"
