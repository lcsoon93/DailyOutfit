package io.github.lcsoon93.dailyoutfit;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // L'app disegna sotto la barra di stato e quella dei gesti: i margini
        // sicuri arrivano alla pagina come variabili CSS --safe-area-inset-*.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
