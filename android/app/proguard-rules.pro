# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
# v2.4.6: R8 有効化に合わせて有効にした。Play のクラッシュレポートで行番号を
# 読めるようにするため（クラス名・メソッド名の難読化には影響しない）。
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
-renamesourcefileattribute SourceFile

# v2.4.6: Capacitor の注釈（@CapacitorPlugin / @Permission / @PluginMethod など）を
# keep する。Capacitor はこれらを実行時にリフレクションで読むが、R8 のフルモードは
# 注釈クラスが keep されていないと「この注釈のインスタンスは存在しない（常に null）」と
# 判断し、読み出し部分を `throw null` に置き換えてしまう。実際に R8 を有効にした
# 最初のビルドでは、起動直後の LocalNotifications.checkPermissions() で
# Plugin.getPermissionStates() が NullPointerException になりアプリが落ちた
# （Capacitor 本体同梱のルールは注釈の付いたクラスを keep するだけで、注釈クラス
# 自体は keep していない）。
-keep @interface com.getcapacitor.annotation.** { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }
-keep @interface com.getcapacitor.NativePlugin { *; }
