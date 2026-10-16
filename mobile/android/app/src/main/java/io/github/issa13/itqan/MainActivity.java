package io.github.issa13.itqan;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Our own small plugin (ItqanWindowPlugin.java) — must be
        // registered before super.onCreate().
        registerPlugin(ItqanWindowPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
