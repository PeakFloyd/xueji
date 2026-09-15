package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;

/**
 * 授课 数据访问对象(DAO)。
 *
 * <p>封装 teaching 表（教师与课程的 m:n 联系表）。该表由两个外键组成复合主键、
 * 不含其它非主属性，故只提供「新增 / 删除 / 查询」，没有需要修改的字段。</p>
 */
public class TeachingDao {

    /**
     * 查询所有授课关系（联表带出教师姓名与课程名）。
     *
     * @return 每行以 Object[] 表示 [teacherId, teacherName, courseId, courseName]
     */
    public List<Object[]> findAllWithNames() {
        List<Object[]> list = new ArrayList<>();
        String sql = "SELECT t.teacher_id, t.teacher_name, c.course_id, c.course_name "
                + "FROM teaching te "
                + "JOIN teacher t ON t.teacher_id = te.teacher_id "
                + "JOIN course c ON c.course_id = te.course_id "
                + "ORDER BY t.teacher_id, c.course_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(new Object[]{
                        rs.getString("teacher_id"),
                        rs.getString("teacher_name"),
                        rs.getString("course_id"),
                        rs.getString("course_name")
                });
            }
        } catch (Exception e) {
            throw new RuntimeException("查询授课关系失败", e);
        }
        return list;
    }

    /**
     * 新增一条授课关系。
     *
     * @param teacherId 教师号
     * @param courseId  课程号
     * @return 影响行数
     */
    public int insert(String teacherId, String courseId) {
        String sql = "INSERT INTO teaching(teacher_id, course_id) VALUES(?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, teacherId);
            ps.setString(2, courseId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增授课失败（教师号或课程号不存在，或关系已存在）", e);
        }
    }

    /**
     * 删除一条授课关系。
     *
     * @param teacherId 教师号
     * @param courseId  课程号
     * @return 影响行数
     */
    public int delete(String teacherId, String courseId) {
        String sql = "DELETE FROM teaching WHERE teacher_id = ? AND course_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, teacherId);
            ps.setString(2, courseId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除授课失败", e);
        }
    }
}
