/* Copyright (c) 2013 Bonnie Leach
 * Licensed under the MIT License.
 * http://www.opensource.org/licenses/mit-license.php
 *
 * v0.1 - 28/01/13
 * Suppon Nabe is a Firefox Extension for use with WaniKani.com.
 * It queries the site's API for when the user's next review is and 
 * counts towards that. Once reviews or lessons are available, it 
 * will check every few minutes based on the user's preferences to
 * see if they have finished their reviews. Once there are none, it
 * will wait for the next reviews to be available again.
 */

var Suppon_Nabe = {
  api_url: "http://www.wanikani.com/api/v1.1/user/",
  prefs: null,
  api_key: null,
  check_min: null,
  button: null,
  timer: null,
  state: null,
  
  // Set up preference access, add an observer for preference changes.
  // If the API key looks valid, try to update the review time.
  startup: function() {
    // Set up the preference observer.
    this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch("extensions.suppon_nabe.");
    this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
    this.prefs.addObserver("", this, false);

    // Collect needed references such as the button and preferences.
    this.button = document.getElementById("sn_button");
    this.check_min = this.prefs.getIntPref("check_min");
    if (typeof this.check_min === "undefined" || this.check_min === null || 
        this.check_min < 1) {
      this.check_min = 1;
      this.prefs.setIntPref("check_min",1);
    }
    // Multiply it by 60000 to convert minutes to milliseconds.
    this.check_min = this.check_min * 60000;

    // The API key is always 32 characters. If it looks like one,
    // attempt to update the icon.
    this.api_key = this.prefs.getCharPref("api_key");
    if (this.api_key != null && this.api_key.length === 32)
      this.update_review_time(this);
    else
      this.button.tooltipText = 
        "You must input your WaniKani API key.";
  },

  // Watches for preference changes.
  observe: function(subject, topic, data) {
    if (topic != "nsPref:changed")
      return;

    switch(data) {
      // If the API key is changed, it is only valid at 32 characters.
      // If it looks valid, an attempt to connect is made; otherwise an
      // error is reported. It clears the current timeout in case the
      // user changes.
      case "api_key":
        window.clearTimeout(this.timer);
        this.timer = null;
        this.api_key = this.prefs.getCharPref("api_key");
        if (this.api_key != null &&
            this.api_key.length === 32)
          this.update_review_time(this);
        else {
          this.button.className = "bad_button";
          this.button.tooltipText =
            "You must input your WaniKani API key.";
        }
        break;

      // Saves the number of minutes for the refresh interval and
      // converts it to milliseconds.
      case "check_min":
        this.check_min = this.prefs.getCharPref("check_min");
        if (this.check_min === null || this.check_min < 1) {
          this.check_min = 1;
          this.prefs.setIntPref("check_min",this.check_min);
        }
        this.check_min = this.check_min * 60000;
        break;
    }
  },

  // Tries to connect to the WaniKani API and sets the icon based
  // on current study conditions.
  update_review_time: function(sender) {
    // Request the study queue.
    var url = sender.api_url + sender.api_key + "/study-queue";
    $.getJSON(url, null,
      function(data) {
        if (typeof data.error != 'undefined') { 
          // If the request returns an error, display it and change
          // to the bad icon.
          sender.button.className = "bad_button";
          sender.state = data.error.message;
          sender.button.tooltipText = sender.state;
        } else {
          if (data.requested_information.reviews_available > 0) {
            // If there are reviews available, change as much and start
            // the timer based on the user's set interval.
            sender.state = "Reviews available!";
            sender.button.tooltipText = sender.state;
            sender.button.className = "review_button";
            sender.timer = window.setTimeout(
              function() {sender.update_review_time(sender);}, 
              sender.check_min);
          } else if (data.requested_information.lessons_available > 0) {
            // If there are lessons available, change as much and start
            // the timer based on the user's set interval.
            sender.state = "Lessons available!";
            sender.button.tooltipText = sender.state;
            sender.button.className = "lesson_button";
            sender.timer = window.setTimeout(
              function() {sender.update_review_time(sender);},
              sender.check_min);
          } else {
            // If there are no reviews or lessons, go into relax mode.
            // Get the date from the request and start a timer to end
            // at that time.
            sender.button.className = "relax_button";
            var date = 
              new Date(data.requested_information.next_review_date*1000);
            sender.state = "Next review: " +
              date.toLocaleTimeString() + " " + date.toLocaleDateString();
            sender.button.tooltipText = sender.state;
            // Set an alarm for when the next review is up (plus a second).
            sender.timer = window.setTimeout(
              function() {sender.update_review_time(sender);},
              (data.requested_information.next_review_date * 1000) -
              new Date().getTime() + 1000);
    }}})
    .fail(function(jqXHR, textStatus, errorThrown) { 
      // If the JSON request fails, put the error in the tooltip but
      // also the last known state. This means a person will know what
      // the last known review time (for example) is if they get
      // disconnected or their request is denied since it is capped at
      // 100 requests per hour.
      sender.button.tooltipText = errorThrown + 
        "\nLast state: " + sender.state;
      sender.button.className = "bad_button";
      sender.timer = window.setTimeout(
        function() {sender.update_review_time(sender);}, sender.check_min);
  });},

  // Stop watching for preference changes.
  shutdown: function() {
    this.prefs.removeObserver("", this);
  }
}

// Run startup when the browser loads.
window.addEventListener("load", function(e) { Suppon_Nabe.startup(); },
  false);
// Run shutdown when the browser unloads.
window.addEventListener("unload", function(e) { Suppon_Nabe.shutdown(); }, 
  false);