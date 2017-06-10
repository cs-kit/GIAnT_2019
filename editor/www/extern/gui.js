gui_finished_loading = false;

jQuery(window).load(function(){
        gui_finished_loading = true;
        jQuery('#overlay').fadeOut();
});

setTimeout(function(){
        if (!gui_finished_loading) {
                jQuery('#overlay').fadeIn();
        }
}, 1000);

$(document).ready(function() {
    $("a").click(function () {
        console.log("click")
        $(this).addClass('loading-link');
        return true;
    });
});