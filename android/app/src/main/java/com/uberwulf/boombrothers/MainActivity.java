package com.uberwulf.boombrothers;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Boom Brothers on Android: the same game as on PC (index.html + game.js, bundled in assets),
 * shown full-screen in landscape. The game's own on-screen touch buttons appear as soon as
 * the screen is touched, and the back button works like Esc (pause, or back in the menus).
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // remembers which levels are unlocked
        s.setMediaPlaybackRequiresUserGesture(false); // sound effects and music
        s.setAllowFileAccess(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.setBackgroundColor(0xFF0B0B18);
        web.addJavascriptInterface(new BoomApp(), "BoomApp"); // lets the game's EXIT GAME close the app
        setContentView(web);
        hideSystemBars();

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // The game treats Esc as "pause" while playing and "back" in its menus.
        web.evaluateJavascript(
                "dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));"
                        + "setTimeout(function(){dispatchEvent(new KeyboardEvent('keyup',{code:'Escape'}))},50);",
                null);
    }

    /** Called from the game (window.BoomApp.exit()) when someone picks EXIT GAME. */
    public class BoomApp {
        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() { public void run() { finishAndRemoveTask(); } });
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
