// kwazar    
var scrollLock = false;
var scrollLock2 = false;
var scrollLock3 = false;
var scrollLock4 = false;

window.addEventListener('scroll', function() {
  
  	var supportPageOffset = window.pageXOffset !== undefined;
	var isCSS1Compat = ((document.compatMode || "") === "CSS1Compat");
  
  	var body = document.body, html = document.documentElement;

	var docheight = Math.max( body.scrollHeight, body.offsetHeight, 
                       html.clientHeight, html.scrollHeight, html.offsetHeight );

	//var scrollLeft = supportPageOffset ? window.pageXOffset : isCSS1Compat ? document.documentElement.scrollLeft : document.body.scrollLeft;
	var wintop = supportPageOffset ? window.pageYOffset : isCSS1Compat ? document.documentElement.scrollTop : document.body.scrollTop;
  	var winheight = window.innerHeight;  

    //var wintop = jQuery(window).scrollTop(), docheight = jQuery(document).height(), winheight = jQuery(window).height();
    var scrolltrigger = 0.25;
    var scrolltrigger2 = 0.5;
    var scrolltrigger3 = 0.75;
    var scrolltrigger4 = 0.95;

    if ((wintop / (docheight - winheight)) > scrolltrigger && !scrollLock) {
        scrollLock = true;
        fbq('trackCustom', 'Scroll25');
    }

    if ((wintop / (docheight - winheight)) > scrolltrigger2 && !scrollLock2) {
        scrollLock2 = true;
        fbq('trackCustom', 'Scroll50');
    }

    if ((wintop / (docheight - winheight)) > scrolltrigger3 && !scrollLock3) {
        scrollLock3 = true;
        fbq('trackCustom', 'Scroll75');
    }

    if ((wintop / (docheight - winheight)) > scrolltrigger4 && !scrollLock4) {
        scrollLock4 = true;
        fbq('trackCustom', 'Scroll95');
    }
});

document.addEventListener("DOMContentLoaded", function(event) {
    sec5 = setInterval(event5sec, 5000);
    sec10 = setInterval(event10sec, 10000);
    sec15 = setInterval(event15sec, 15000);
    sec30 = setInterval(event30sec, 30000);
    min1 = setInterval(event1min, (60000));
    min2 = setInterval(event2min, (2 * 60000));
    min3 = setInterval(event3min, (3 * 60000));
    min5 = setInterval(event5min, (5 * 60000));
    min10 = setInterval(event10min, (10 * 60000));
    min20 = setInterval(event20min, (20 * 60000));
    min30 = setInterval(event30min, (30 * 60000));

});

function event30sec()
{
    clearInterval(sec30);
    fbq('trackCustom', "30sec");
}

function event15sec()
{
    clearInterval(sec15);
    fbq('trackCustom', "15sec");
}

function event10sec()
{
    clearInterval(sec10);
    fbq('trackCustom', "10sec");
}

function event5sec()
{
    clearInterval(sec5);
    fbq('trackCustom', "5sec");
}

function event1min()
{
    clearInterval(min1);
    fbq('trackCustom', "1mins");
}

function event2min()
{
    clearInterval(min2);
    fbq('trackCustom', "2mins");
}

function event3min()
{
    clearInterval(min3);
    fbq('trackCustom', "3mins");
}

function event5min()
{
    clearInterval(min5);
    fbq('trackCustom', "5mins");
}

function event10min()
{
    clearInterval(min10);
    fbq('trackCustom', "10mins");
}

function event20min()
{
    clearInterval(min20);
    fbq('trackCustom', "20mins");
}

function event30min()
{
    clearInterval(min30);
    fbq('trackCustom', "30mins");
}