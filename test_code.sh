if grep -Fq "debug = false" assets/js/content.js
then
    echo "Debug mode set correctly for this project!"
    exit 0
else
    echo "Debug mode NOT set correctly for this project!"
    exit 1
fi
